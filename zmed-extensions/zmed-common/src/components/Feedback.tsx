import React, { useState } from 'react';
import FeedbackUI from './ui/FeedbackUI';

interface FeedbackProps {
  email: string;
  apiKey?: string;
}

const Feedback: React.FC<FeedbackProps> = ({ email, apiKey }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showButton, setShowButton] = useState(true);
  const [successMessage, setSuccessMessage] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        'https://platform-api-v1.z-union.ru/api/jobs',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey || '',
          },
          body: JSON.stringify({
            agent: '12',
            input_params: {
              email_or_username: email,
              report: message,
              platform_name: 'zMed',
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Ошибка при отправке сообщения');
      }

      setSuccessMessage(true);
      setMessage('');

      // Закрываем окно через 2 секунды после успешной отправки
      setTimeout(() => {
        setIsOpen(false);
        setSuccessMessage(false);
      }, 2000);
    } catch (error) {
      console.error('Ошибка:', error);
      // Здесь можно добавить обработку ошибки, например показать уведомление пользователю
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setShowButton(false);
    setSuccessMessage(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSuccessMessage(false);
    const timer = setTimeout(() => {
      setShowButton(true);
    }, 300);
    return () => clearTimeout(timer);
  };

  return (
    <FeedbackUI
      isOpen={isOpen}
      message={message}
      isSubmitting={isSubmitting}
      showButton={showButton}
      successMessage={successMessage}
      onOpen={handleOpen}
      onClose={handleClose}
      onSubmit={handleSubmit}
      onMessageChange={setMessage}
    />
  );
};

export default Feedback;
