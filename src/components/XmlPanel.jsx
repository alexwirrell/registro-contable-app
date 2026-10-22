// src/components/XmlPanel.jsx

import React, { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { Trash2, Plus, Save, RefreshCw } from "lucide-react";

const EditableCell = ({ getValue, row, column, table }) => {
  const initialValue = getValue();
  const [value, setValue] = useState(initialValue);

  const onBlur = () => {
    table.options.meta?.updateData(row.index, column.id, value);
  };

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleKeyDown = (e) => {
    if (e.key === 'F2') {
      e.preventDefault(); 
      
      let catalogType = null;
      switch (column.id) {
        case 'cuentaContable':
          catalogType = 'PUC';
          break;
        case 'centroDeCostos':
          catalogType = 'Centro de Costos';
          break;
        case 'conceptoRetencion':
          catalogType = 'Concepto de Retención';
          break;
        default:
          break;
      }
      
      if (catalogType) {
        table.options.meta?.openLookupModal(row.index, column.id, catalogType);
      }
    }
  };

  return (
    <input
      value={value || ""}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      className="w-full bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 p-1 rounded-sm"
    />
  );
};

const defaultColumn = {
  cell: EditableCell,
};

const XmlPanel = ({ initialData, onGridDataChange, onSave, onRefresh,onOpenLookup  }) => {
  const [data, setData] = useState(initialData || []);
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    const newData = initialData || [];

    setData(newData);

    if (newData.length > 0 && newData.length !== data.length) {
      setSelectedRow(0);
    }

    if (newData.length === 0) {
        setSelectedRow(null);
    }

  }, [initialData]);

  const addRow = () => {
    let newRow;
    if (data.length === 0) {
      newRow = {
        id: `manual-${Date.now()}`,
        tipoDoc: "",
        nitVendedor: "",
        razonSocialVendedor: "",
        nitComprador: "",
        razonSocialComprador: "",
        nroDocumento: "",
        fechaEmision: "",
        fechaVencimiento: "",
        renglon: "1",
        codigo: "",
        descripcion: "",
        um: "",
        cantidad: "",
        precioUnitario: "",
        valor: "",
        cuentaContable: "",
        centroDeCostos: "",
        conceptoRetencion: "",
        descripcionRegistro: "",
        tipoRegistro: "BASE",
      };
    } else {
      const referenceRow = data[0];
      const nextRenglon = (data.length + 1).toString();
      newRow = {
        id: `manual-${Date.now()}`,
        tipoDoc: referenceRow.tipoDoc || "",
        nitVendedor: referenceRow.nitVendedor || "",
        razonSocialVendedor: referenceRow.razonSocialVendedor || "",
        nitComprador: referenceRow.nitComprador || "",
        razonSocialComprador: referenceRow.razonSocialComprador || "",
        nroDocumento: referenceRow.nroDocumento || "",
        fechaEmision: referenceRow.fechaEmision || "",
        fechaVencimiento: referenceRow.fechaVencimiento || "",
        renglon: nextRenglon,
        codigo: "",
        descripcion: "",
        um: "",
        cantidad: "",
        precioUnitario: "",
        valor: "",
        cuentaContable: "",
        centroDeCostos: "",
        conceptoRetencion: "",
        descripcionRegistro: "",
        tipoRegistro: "BASE",
      };
    }
    const newData = [...data, newRow];
    setData(newData);
    onGridDataChange(newData);
  };

  const removeRow = (rowIndex) => {
    const newData = data.filter((_, index) => index !== rowIndex);

    let newSelectedRow = null;
    if (newData.length > 0) {
      newSelectedRow = rowIndex === 0 ? 0 : rowIndex - 1;
    }

    setData(newData);
    setSelectedRow(newSelectedRow);
    onGridDataChange(newData);
  };

  const removeSelectedRow = () => {
    if (selectedRow !== null && selectedRow < data.length) {
      removeRow(selectedRow);
    }
  };

  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    const dataKeys = Object.keys(data[0] || {}).filter((key) => key !== "id");
    return dataKeys.map((key) => ({
      accessorKey: key,
      header: key.replace(/([A-Z])/g, " $1").trim(),
      size: 150,
    }));
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    meta: {
      updateData: (rowIndex, columnId, value) => {
        const newData = data.map((row, index) => {
          if (index === rowIndex) {
            return { ...data[rowIndex], [columnId]: value };
          }
          return row;
        });
        setData(newData);
        onGridDataChange(newData);
      },
      openLookupModal: onOpenLookup
    },
  });

  if (!data || data.length === 0) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-gray-500">
        <p>No hay datos de XML para mostrar.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-none p-2 border-b bg-gray-50 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">Editor de Datos XML</p>
        <div className="flex items-center space-x-2">
          <button
            onClick={onRefresh}
            className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition duration-300"
            title="Descartar cambios y refrescar"
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={() => onSave(data)}
            className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition duration-300"
            title="Guardar cambios en la base de datos"
          >
            <Save size={16} />
          </button>
          <button
            onClick={addRow}
            className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition duration-300"
            title="Añadir nueva fila"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={removeSelectedRow}
            disabled={selectedRow === null || data.length === 0}
            className={`p-2 rounded-md transition duration-300 ${
              selectedRow !== null && data.length > 0
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
            title="Eliminar fila seleccionada"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="flex-grow overflow-auto">
        <table
          className="w-full text-xs border-collapse"
          style={{ width: table.getTotalSize() }}
        >
          <thead className="bg-gray-100 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className="p-2 border-b-2 border-r border-gray-300 font-bold capitalize relative text-left"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none touch-none ${
                        header.column.getIsResizing() ? "bg-blue-500" : ""
                      }`}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
              key={row.id}
              className={`hover:bg-gray-50 cursor-pointer ${selectedRow === row.index ? "bg-blue-100 border-l-4 border-blue-500" : ""}`}
              onClick={() => {
                setSelectedRow(row.index);
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="p-0 border-b border-r border-gray-200" style={{ width: cell.column.getSize() }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default XmlPanel;
