import React from 'react';
import '../App.css';

const Card = ({ title, value, children }) => {
  return (
    <div className="card">
      {title && <h3 className="card-title">{title}</h3>}
      {value !== undefined && <p className="card-value">{value}</p>}
      {children}
    </div>
  );
};

export default Card;
