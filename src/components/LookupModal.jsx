// src/components/LookupModal.jsx

import React, { useState, useEffect, useMemo, useRef } from "react";

const LookupModal = ({ isOpen, title, data, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef(null);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return data.filter((item) =>
      Object.values(item).some((val) =>
        String(val).toLowerCase().includes(lowerCaseSearch)
      )
    );
  }, [data, searchTerm]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setActiveIndex(0);
    }
  }, [isOpen, data]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        setActiveIndex((prev) => Math.min(prev + 1, filteredData.length - 1));
      } else if (e.key === "ArrowUp") {
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        if (filteredData[activeIndex]) {
          onSelect(filteredData[activeIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, activeIndex, filteredData, onSelect, onClose]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Encabezado */}
        <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-3xl"
          >
            &times;
          </button>
        </div>

        {/* Barra de Búsqueda */}
        <div className="p-4 border-b flex-shrink-0">
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Lista de Resultados */}
        <div className="overflow-y-auto flex-grow">
          {filteredData.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {filteredData.map((item, index) => {
                const isSelected = index === activeIndex;
                const keys = Object.keys(item);
                return (
                  <li
                    key={index}
                    ref={isSelected ? activeItemRef : null}
                    onClick={() => onSelect(item)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold w-1/3 truncate">
                        {item[keys[0]]}
                      </span>
                      <span
                        className={`text-gray-600 w-2/3 truncate ${
                          isSelected ? "text-blue-200" : ""
                        }`}
                      >
                        {item[keys[1]]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-4 text-center text-gray-500">
              No se encontraron resultados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LookupModal;
