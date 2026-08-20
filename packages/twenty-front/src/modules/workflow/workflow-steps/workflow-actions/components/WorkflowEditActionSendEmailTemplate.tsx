import { useEffect, useState } from 'react';

import { t } from '@lingui/core/macro';

import { FormSelectFieldInput } from '@/object-record/record-field/ui/form-types/components/FormSelectFieldInput';
import { FormTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormTextFieldInput';
import { type WorkflowSendEmailTemplateAction } from '@/workflow/types/Workflow';
import { WorkflowStepBody } from '@/workflow/workflow-steps/components/WorkflowStepBody';
import { WorkflowStepFooter } from '@/workflow/workflow-steps/components/WorkflowStepFooter';
import { useSendEmailTemplateForm } from '@/workflow/workflow-steps/workflow-actions/hooks/useSendEmailTemplateForm';
import { WorkflowVariablePicker } from '@/workflow/workflow-variables/components/WorkflowVariablePicker';

type TemplateOption = {
  label: string;
  value: string;
};

type WorkflowEditActionSendEmailTemplateProps = {
  action: WorkflowSendEmailTemplateAction;
  actionOptions:
    | {
        readonly: true;
      }
    | {
        readonly?: false;
        onActionUpdate: (action: WorkflowSendEmailTemplateAction) => void;
      };
};

export const WorkflowEditActionSendEmailTemplate = ({
  action,
  actionOptions,
}: WorkflowEditActionSendEmailTemplateProps) => {
  const { formData, handleFieldChange } = useSendEmailTemplateForm({
    action,
    onActionUpdate:
      actionOptions.readonly === true
        ? undefined
        : actionOptions.onActionUpdate,
    readonly: actionOptions.readonly === true,
  });

  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        query: `
          query ListEmailTemplatesForWorkflow {
            emailTemplates(first: 100) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        `,
      }),
    })
      .then((response) => response.json())
      .then((res) => {
        const edges = res.data?.emailTemplates?.edges ?? [];
        const options = edges.map((edge: { node: { id: string; name: string } }) => ({
          value: edge.node.id,
          label: edge.node.name ?? 'Untitled',
        }));

        setTemplateOptions(options);
      })
      .catch(() => {
        setTemplateOptions([]);
      })
      .finally(() => {
        setTemplatesLoading(false);
      });
  }, []);

  return (
    <>
      <WorkflowStepBody>
        <FormSelectFieldInput
          label={t`Template`}
          hint={
            actionOptions.readonly
              ? undefined
              : t`Pick a saved email template from the Email Templates object`
          }
          defaultValue={formData.templateId}
          options={templateOptions}
          onChange={(value: string | null) => {
            handleFieldChange('templateId', value ?? '');
          }}
          VariablePicker={WorkflowVariablePicker}
          readonly={actionOptions.readonly || templatesLoading}
        />
        <FormTextFieldInput
          label={t`To`}
          placeholder={t`Enter email, comma-separated`}
          readonly={actionOptions.readonly}
          defaultValue={formData.recipients.to}
          onChange={(value: string) => {
            handleFieldChange('recipients', {
              ...formData.recipients,
              to: value,
            });
          }}
          VariablePicker={WorkflowVariablePicker}
        />
        <FormTextFieldInput
          label={t`CC`}
          placeholder={t`Enter CC emails, comma-separated`}
          readonly={actionOptions.readonly}
          defaultValue={formData.recipients.cc}
          onChange={(value: string) => {
            handleFieldChange('recipients', {
              ...formData.recipients,
              cc: value,
            });
          }}
          VariablePicker={WorkflowVariablePicker}
        />
        <FormTextFieldInput
          label={t`BCC`}
          placeholder={t`Enter BCC emails, comma-separated`}
          readonly={actionOptions.readonly}
          defaultValue={formData.recipients.bcc}
          onChange={(value: string) => {
            handleFieldChange('recipients', {
              ...formData.recipients,
              bcc: value,
            });
          }}
          VariablePicker={WorkflowVariablePicker}
        />
        <FormTextFieldInput
          label={t`Subject`}
          placeholder={t`Leave empty to use the template's subject`}
          readonly={actionOptions.readonly}
          defaultValue={formData.subject}
          onChange={(value: string) => {
            handleFieldChange('subject', value);
          }}
          VariablePicker={WorkflowVariablePicker}
        />
      </WorkflowStepBody>
      {!actionOptions.readonly && <WorkflowStepFooter stepId={action.id} />}
    </>
  );
};