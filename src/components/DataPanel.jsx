// src/components/DataPanel.jsx

import React, { useRef, forwardRef } from "react";
import CurrencyInput from "./CurrencyInput";

const FormInput = forwardRef(
  (
    {
      label,
      name,
      value,
      onChange,
      type = "text",
      placeholder = "",
      onFocus,
      isActive,
      onKeyDown,
    },
    ref
  ) => (
    <div className="mb-4">
      <label
        htmlFor={name}
        className="block text-gray-700 text-sm font-bold mb-2"
      >
        {label}
      </label>
      <input
        ref={ref}
        type={type}
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onFocus={onFocus} 
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        
        className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none bg-gray-50 ${
          isActive ? "ring-2 ring-blue-500" : ""
        }`}
      />
    </div>
  )
);

const DataPanel = ({
  consecutivoRef,
  formVersion,
  formData,
  onFormChange,
  onAddRetention,
  onRemoveRetention,
  onRetentionChange,
  onFieldFocus,
  activeFieldId,
  onSave,
  onClearFocus,
  onSaveTemplate,
  onLoadTemplate,
  onProcessDataToXml,
  onOpenRetentionLookup,
}) => {
  if (!formData) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-bold mb-4">Datos y Acciones</h2>
        <p className="text-gray-500">
          Seleccione o cargue un PDF para empezar.
        </p>
      </div>
    );
  }

  const handleContainerClick = (e) => {
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      onClearFocus();
      document.body.focus();
    }
  };

  const textareaRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const finalValue = type === "number" ? parseFloat(value) || 0 : value;
    onFormChange(name, finalValue);
    if (name === "comentarios" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Escape") {
      e.target.blur();
      onClearFocus();
    }
  };

  const handleRetentionNameKeyDown = (e, retentionId) => {
    if (e.key === 'F2') {
      e.preventDefault();
      onOpenRetentionLookup(retentionId);
    }

    handleInputKeyDown(e);
  };

  return (
    <div className="p-4" onClick={handleContainerClick}>
      <h2 className="text-lg font-bold mb-4">Datos y Acciones</h2>
      <form key={formVersion} autoComplete="off">
        <FormInput
          label="Nombre del archivo final"
          name="nombreArchivoFinal"
          value={formData.nombreArchivoFinal}
          onChange={handleChange}
          onKeyDown={handleInputKeyDown}
        />
        <FormInput
          ref={consecutivoRef}
          label="Consecutivo"
          name="consecutivo"
          value={formData.consecutivo}
          onChange={handleChange}
          onFocus={(e) => onFieldFocus("consecutivo", e)}
          isActive={activeFieldId === "consecutivo"}
          onKeyDown={handleInputKeyDown}
        />

        <div className="border-t my-6 pt-2">
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm font-bold text-gray-700">
              Retenciones
            </label>
            <button
              type="button"
              onClick={onAddRetention}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-full text-sm"
            >
              +
            </button>
          </div>
          {formData.retencionesDinamicas.map((retencion) => (
            <div
              key={retencion.id}
              className={`p-2 border rounded-lg bg-gray-50 mb-2 ${
                activeFieldId === retencion.id ? "ring-2 ring-blue-500" : ""
              }`}
            >
              {/* Usamos Flexbox, es más sencillo para este caso final. */}
              <div className="flex items-center space-x-2">
                {/* Columna 1: Input de Nombre */}
                <input
                  type="text"
                  placeholder="Ej: Compras 2.5%"
                  value={retencion.nombre}
                  onChange={(e) =>
                    onRetentionChange(retencion.id, "nombre", e.target.value)
                  }
                  onFocus={(e) => onFieldFocus(retencion.id, e)}
                  onKeyDown={(e) => handleRetentionNameKeyDown(e, retencion.id)}
                  className={`flex-grow shadow-inner border rounded w-full py-2 px-3 text-gray-700 focus:outline-none h-11`}
                />

                {/* Columna 2: Input de Valor (hermano directo) */}
                <CurrencyInput
                  name={`retencion-valor-${retencion.id}`}
                  value={retencion.valor}
                  onChange={(e) => onRetentionChange(retencion.id, 'valor', e.target.value)}
                  onFocus={(e) => onFieldFocus(retencion.id, e)}
                  isActive={activeFieldId === retencion.id}
                  onKeyDown={handleInputKeyDown}
                  className={`w-32 h-11`}
                />

                {/* Columna 3: Botón de Eliminar */}
                <button
                  type="button"
                  onClick={() => onRemoveRetention(retencion.id)}
                  className="text-red-500 ... h-11 flex items-center"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t my-6"></div>
        <CurrencyInput
          label="Total Cuenta por Pagar"
          name="totalPagar"
          type="number"
          value={formData.totalPagar}
          onChange={handleChange}
          onFocus={(e) => onFieldFocus("totalPagar", e)}
          isActive={activeFieldId === "totalPagar"}
          onKeyDown={handleInputKeyDown}
        />
        <div className="border-t my-6"></div>
        <div className="mb-4">
          <label
            htmlFor="comentarios"
            className="block text-gray-700 text-sm font-bold mb-2"
          >
            Comentarios
          </label>
          <textarea
            ref={textareaRef}
            id="comentarios"
            name="comentarios"
            value={formData.comentarios}
            onChange={handleChange}
            placeholder="Añade una nota o comentario aquí..."
            className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none bg-gray-50 overflow-hidden resize-none ${
              activeFieldId === "comentarios" ? "ring-2 ring-blue-500" : ""
            }`}
            onFocus={(e) => onFieldFocus("comentarios", e)}
            onKeyDown={handleInputKeyDown}
          />
        </div>
      </form>

      <div className="mt-4 pt-4 border-t space-y-2">
        <h3 className="text-sm font-bold text-gray-700 mb-2">Plantillas</h3>
        <button
          onClick={onLoadTemplate}
          className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300"
        >
          Cargar Plantilla
        </button>
        <button
          onClick={onSaveTemplate}
          className="w-full bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition duration-300"
        >
          Guardar Plantilla Actual
        </button>
      </div>

      <div className="mt-4 pt-4 border-t space-y-2">
         <button
          onClick={onProcessDataToXml}
          className="w-full bg-purple-600 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded transition duration-300"
        >
          Procesar a Tabla
        </button>
      </div>

      <div className="mt-auto pt-4 border-t">
        <button
          onClick={onSave}
          className="w-full bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-4 rounded transition duration-300"
        >
          GUARDAR PDF
        </button>
      </div>
    </div>
  );
};

export default DataPanel;
