import { FormMultiTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormMultiTextFieldInput';
import { FormSelectFieldInput } from '@/object-record/record-field/ui/form-types/components/FormSelectFieldInput';
import { FormTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormTextFieldInput';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type WorkflowSendEmailTemplateAction } from '@/workflow/types/Workflow';
import { WorkflowStepBody } from '@/workflow/workflow-steps/components/WorkflowStepBody';
import { WorkflowStepFooter } from '@/workflow/workflow-steps/components/WorkflowStepFooter';
import { useSendEmailTemplateForm } from '@/workflow/workflow-steps/workflow-actions/hooks/useSendEmailTemplateForm';
import { WorkflowVariablePicker } from '@/workflow/workflow-variables/components/WorkflowVariablePicker';
import { type SelectOption } from 'twenty-ui/input';

type EmailTemplateRecord = {
  id: string;
  name: string;
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

  const { records: emailTemplates, loading: templatesLoading } =
    useFindManyRecords<EmailTemplateRecord>({
      objectNameSingular: 'emailTemplate',
      recordGqlFields: {
        id: true,
        name: true,
      },
      limit: 100,
    });

  const templateOptions: SelectOption[] = emailTemplates.map((template) => ({
    label: template.name || 'Untitled template',
    value: template.id,
  }));

  return (
    <>
      <WorkflowStepBody>
        <FormSelectFieldInput
          label="Template"
          hint={
            templatesLoading
              ? 'Loading templates...'
              : templateOptions.length === 0
                ? 'No templates yet. Create one under Email Templates, then come back.'
                : 'Pick a saved email template'
          }
          defaultValue={formData.templateId}
          options={templateOptions}
          onChange={(value: string | null) => {
            handleFieldChange('templateId', value ?? '');
          }}
          VariablePicker={WorkflowVariablePicker}
          readonly={actionOptions.readonly === true || templatesLoading}
        />
        <FormMultiTextFieldInput
          label="To"
          placeholder="person@example.com"
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
        <FormMultiTextFieldInput
          label="CC"
          placeholder="Optional CC"
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
        <FormMultiTextFieldInput
          label="BCC"
          placeholder="Optional BCC"
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
          label="Subject override"
          placeholder="Leave empty to use the template subject"
          readonly={actionOptions.readonly}
          defaultValue={formData.subject}
          onChange={(value: string) => {
            handleFieldChange('subject', value);
          }}
          VariablePicker={WorkflowVariablePicker}
        />
      </WorkflowStepBody>
      {actionOptions.readonly !== true && (
        <WorkflowStepFooter stepId={action.id} />
      )}
    </>
  );
};
