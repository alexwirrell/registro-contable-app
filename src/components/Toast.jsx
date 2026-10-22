// src/components/Toast.jsx

import React, { useState, useEffect } from 'react';

const Toast = ({ message, type = 'success', onDone }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDone, 500);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [message, onDone]);

  const baseStyle = "fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white transition-transform duration-500 ease-in-out";
  const typeStyle = type === 'success' ? 'bg-green-500' : 'bg-red-500';
  const visibilityStyle = visible ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]';

  if (!message) return null;

  return (
    <div className={`${baseStyle} ${typeStyle} ${visibilityStyle}`}>
      {message}
    </div>
  );
};

export default Toast;