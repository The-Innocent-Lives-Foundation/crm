import { useState } from 'react';
import { type WorkflowSendEmailTemplateAction } from '@/workflow/types/Workflow';
import { type JsonValue } from 'type-fest';
import { useDebouncedCallback } from 'use-debounce';

type SendEmailTemplateFormData = {
  templateId: string;
  recipients: {
    to: string;
    cc: string;
    bcc: string;
  };
  subject: string;
};

type UseSendEmailTemplateFormParams = {
  action: WorkflowSendEmailTemplateAction;
  onActionUpdate?: (action: WorkflowSendEmailTemplateAction) => void;
  readonly: boolean;
};

export const useSendEmailTemplateForm = ({
  action,
  onActionUpdate,
  readonly,
}: UseSendEmailTemplateFormParams) => {
  const [formData, setFormData] = useState<SendEmailTemplateFormData>(() => {
    const input = action.settings.input;

    return {
      templateId: input.templateId ?? '',
      recipients: {
        to: input.recipients?.to ?? '',
        cc: input.recipients?.cc ?? '',
        bcc: input.recipients?.bcc ?? '',
      },
      subject: input.subject ?? '',
    };
  });

  const saveAction = useDebouncedCallback(
    (formData: SendEmailTemplateFormData) => {
      if (readonly) {
        return;
      }

      onActionUpdate?.({
        ...action,
        settings: {
          ...action.settings,
          input: {
            templateId: formData.templateId,
            recipients: {
              to: formData.recipients.to,
              cc: formData.recipients.cc,
              bcc: formData.recipients.bcc,
            },
            subject: formData.subject,
          },
        },
      });
    },
    1_000,
  );

  const handleFieldChange = (
    fieldName: keyof SendEmailTemplateFormData,
    updatedValue: JsonValue,
  ) => {
    const newFormData: SendEmailTemplateFormData = {
      ...formData,
      [fieldName]: updatedValue,
    };

    setFormData(newFormData);
    saveAction(newFormData);
  };

  return {
    formData,
    handleFieldChange,
    saveAction,
  };
};