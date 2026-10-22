// src/components/Annotation.jsx

import React from 'react';

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const Annotation = ({ id, label, value, position, onDragStart, isDragging, zoom }) => {
  if (!position) {
    return null;
  }

  let displayValue = value;

  const isCurrencyField = id !== 'consecutivo' && id !== 'comentarios';

  const num = Number(value);

  if (isCurrencyField && !isNaN(num)) {
    displayValue = currencyFormatter.format(num);
  }

  const isCurrency = id !== 'consecutivo' && id !== 'comentarios';

  if (isCurrency && !isNaN(num)) {
    displayValue = currencyFormatter.format(num);
}
  
  const style = {
    position: 'absolute',
    top: position ? `${position.y}%` : '5%',
    left: position ? `${position.x}%` : '5%',
    backgroundColor: 'rgba(255, 255, 0, 0.85)',
    border: '1px dashed black',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '14px',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    visibility: position ? 'visible' : 'hidden',
    color: 'black', 
    cursor: isDragging ? 'grabbing' : 'grab',
    pointerEvents: isDragging ? 'none' : 'auto', 
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
  };

  return (
    <div 
      style={style}
      onMouseDown={(e) => {
        e.stopPropagation();
        onDragStart(e, id);
      }}
    >
      <strong className="font-semibold">{label}:</strong> {displayValue}
    </div>
  );
};

export default Annotation;