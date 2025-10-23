import { createContext, useContext } from 'react';

export interface ModalText {
  heading: string;
  signupDoneCTA: string;
}

export const defaultModalText: ModalText = {
  heading: 'Sogni Photobooth',
  signupDoneCTA: 'I verified my email!'
};

export interface ModalContextType {
  text: ModalText;
}

export const ModalContext = createContext<ModalContextType>({
  text: defaultModalText
});

export function useModalCtx() {
  return useContext(ModalContext);
}

