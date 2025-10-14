import React, { createContext, useContext } from 'react';
import PropTypes from 'prop-types';
import useToast from '../hooks/useToast';
import ToastContainer from '../components/shared/ToastContainer';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const { toasts, showToast, hideToast, clearAllToasts } = useToast();

  return (
    <ToastContext.Provider value={{ showToast, hideToast, clearAllToasts }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
};

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export const useToastContext = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;
