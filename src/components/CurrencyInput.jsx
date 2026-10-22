// src/components/CurrencyInput.jsx

import React, { useState, useEffect } from "react";

const formatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CurrencyInput = ({
  label,
  name,
  value,
  onChange,
  onFocus,
  isActive,
  onKeyDown,
  className = "",
}) => {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    if (document.activeElement?.name !== name) {
      setDisplayValue(formatter.format(value));
    }
  }, [value, name]);

  const handleFocus = (e) => {
    setDisplayValue(value === 0 ? "" : value.toString());
    if (onFocus) onFocus();
  };

  const handleBlur = () => {
    setDisplayValue(formatter.format(value));
  };

  const handleChange = (e) => {
    const rawValue = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(rawValue)) {
      setDisplayValue(rawValue);
      onChange({
        target: {
          name: name,
          value: parseFloat(rawValue) || 0,
          type: "number",
        },
      });
    }
  };

  const inputElement = (
    <input
      type="text"
      id={name}
      name={name}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      autoComplete="off"
      className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none bg-gray-50 text-right ${className} ${
        isActive ? "ring-2 ring-blue-500" : ""
      }`}
    />
  );

  if (label) {
    return (
      <div className="mb-4">
        <label
          htmlFor={name}
          className="block text-gray-700 text-sm font-bold mb-2"
        >
          {label}
        </label>
        {inputElement}
      </div>
    );
  }

  return inputElement;
};
export default CurrencyInput;
