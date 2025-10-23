import React from 'react';
import '../../styles/components/FormField.css';

interface FormFieldProps {
  name: string;
  label: string;
  value?: string | boolean;
  checked?: boolean;
  type?: 'text' | 'password' | 'email' | 'switch' | 'checkbox';
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  onChange: (value: any, name: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const FormField: React.FC<FormFieldProps> = ({
  name,
  label,
  value = '',
  checked = false,
  type = 'text',
  placeholder,
  autoComplete,
  error,
  onChange,
  disabled = false,
  size = 'md'
}) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === 'switch' || type === 'checkbox') {
      onChange(e.target.checked, name);
    } else {
      onChange(e.target.value, name);
    }
  };

  if (type === 'switch') {
    return (
      <div className="form-field form-field-switch">
        <label className="switch-label">
          <input
            type="checkbox"
            name={name}
            checked={checked}
            onChange={handleInputChange}
            disabled={disabled}
            className="switch-input"
          />
          <span className="switch-slider"></span>
          <span className="switch-text">{label}</span>
        </label>
        {error && <div className="form-field-error">{error}</div>}
      </div>
    );
  }

  if (type === 'checkbox') {
    return (
      <div className="form-field form-field-checkbox">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name={name}
            checked={checked}
            onChange={handleInputChange}
            disabled={disabled}
            className="checkbox-input"
          />
          <span className="checkbox-text">{label}</span>
        </label>
        {error && <div className="form-field-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className={`form-field form-field-${size}`}>
      <label htmlFor={name} className="form-field-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={typeof value === 'string' ? value : ''}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={handleInputChange}
        disabled={disabled}
        className={`form-field-input ${error ? 'form-field-input-error' : ''}`}
      />
      {error && <div className="form-field-error">{error}</div>}
    </div>
  );
};

export default FormField;

