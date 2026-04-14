import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import RewardToast from '../components/ui/RewardToast';

const ModalContext = createContext();

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

export function ModalProvider({ children }) {
  const [VibeModalComponent, setVibeModalComponent] = useState(null);
  const [modalState, setModalState] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    type: 'info'
  });

  useEffect(() => {
    // Load VibeModal after first render to avoid cold start crash
    const timer = setTimeout(() => {
      try {
        const mod = require('../components/ui/VibeModal');
        setVibeModalComponent(() => mod.default);
      } catch (e) {
        console.error('[ModalContext] Failed to load VibeModal:', e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const showModal = ({ title, message, buttons = [], type = 'info' }) => {
    setModalState({ visible: true, title, message, buttons, type });
  };

  const hideModal = () => {
    setModalState(prev => ({ ...prev, visible: false }));
  };

  const showAlert = (title, message, buttons) => {
    showModal({ title, message, buttons: buttons || [], type: 'info' });
  };

  const showConfirm = (title, message, onConfirm, onCancel) => {
    showModal({
      title,
      message,
      type: 'confirm',
      buttons: [
        { text: 'Cancel', onPress: onCancel },
        { text: 'Confirm', onPress: onConfirm }
      ]
    });
  };

  const showSuccess = (title, message) => {
    showModal({ title, message, type: 'success' });
  };

  const showError = (title, message) => {
    showModal({ title, message, type: 'error' });
  };

  // Toast queue
  const [toastQueue, setToastQueue] = useState([]);
  const [activeToast, setActiveToast] = useState(null);

  const showToast = useCallback((type, title, subtitle) => {
    setToastQueue(prev => [...prev, { type, title, subtitle, id: Date.now() }]);
  }, []);

  // Pop next toast from queue
  useEffect(() => {
    if (!activeToast && toastQueue.length > 0) {
      setActiveToast(toastQueue[0]);
      setToastQueue(prev => prev.slice(1));
    }
  }, [activeToast, toastQueue]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  return (
    <ModalContext.Provider value={{
      showAlert,
      showConfirm,
      showSuccess,
      showError,
      hideModal,
      showToast,
    }}>
      {children}
      {VibeModalComponent && (
        <VibeModalComponent
          visible={modalState.visible}
          title={modalState.title}
          message={modalState.message}
          buttons={modalState.buttons}
          type={modalState.type}
          onClose={hideModal}
        />
      )}
      <RewardToast
        visible={!!activeToast}
        type={activeToast?.type}
        title={activeToast?.title}
        subtitle={activeToast?.subtitle}
        onDismiss={dismissToast}
      />
    </ModalContext.Provider>
  );
}
