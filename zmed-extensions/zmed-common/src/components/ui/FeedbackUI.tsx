'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import './FeedbackUI.css';

export interface FeedbackUIProps {
  isOpen: boolean;
  message: string;
  isSubmitting: boolean;
  showButton: boolean;
  successMessage: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: () => void;
  onMessageChange: (message: string) => void;
}

const FeedbackUI: React.FC<FeedbackUIProps> = ({
  isOpen,
  message,
  isSubmitting,
  showButton,
  successMessage,
  onOpen,
  onClose,
  onSubmit,
  onMessageChange,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [showPopup, setShowPopup] = useState(false);

  const handleClickOutside = (event: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      const timer = setTimeout(() => {
        setShowPopup(true);
      }, 150); // Задержка равна длительности анимации кнопки
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    } else {
      setShowPopup(false);
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="feedback-container">
      <AnimatePresence>
        {showButton && !isOpen && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.15 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onOpen}
            className="feedback-button"
            type="button"
          >
            Обратная связь
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && showPopup && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            className="feedback-popup"
          >
            <button
              onClick={onClose}
              className="close-button"
              aria-label="Закрыть"
              type="button"
            >
              &times;
            </button>

            <h3 className="feedback-title">Обратная связь</h3>

            {successMessage ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="success-message"
              >
                Ваше сообщение доставлено
              </motion.div>
            ) : (
              <textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Предложите идею, как улучшить веб-приложение или сообщение об обнаруженном баге"
                className="feedback-textarea"
              />
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onSubmit}
              disabled={isSubmitting || !message.trim() || successMessage}
              className="submit-button"
              type="button"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center">
                  <div className="loading-spinner"></div>
                  Отправка...
                </div>
              ) : (
                'Отправить'
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FeedbackUI;
