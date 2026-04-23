/**
 * This file exists solely to help i18next-parser extract translation keys
 * that are used dynamically and therefore cannot be discovered from string
 * literals at the callsite.
 *
 * _errorI18nKeys covers keys defined in src/shared/models/errors.ts and used
 * dynamically via t(errorDetail.i18nKey) or <Trans i18nKey={errorDetail.i18nKey} />.
 *
 * Other enumerable dynamic keys should be added to _otherI18nKeys.
 *
 * Do NOT delete this file. It is not imported anywhere at runtime.
 * When adding new error codes with i18nKey in errors.ts, add the key here too.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _errorI18nKeys(t: (key: string) => string) {
  // Document parser errors (errors.ts line 230+)
  t(
    'Local document parsing failed. You can go to <OpenDocumentParserSettingButton>Settings</OpenDocumentParserSettingButton> and switch to Chatbox AI for cloud-based document parsing.'
  )
  t('Chatbox AI document parsing failed. Please try again later.')
  t(
    'Document parsing failed. You can go to <OpenDocumentParserSettingButton>Settings</OpenDocumentParserSettingButton> and switch to Chatbox AI for cloud-based document parsing.'
  )
  t(
    'Selected document parser is currently only supported in Knowledge Base. For chat file attachments, please go to <OpenDocumentParserSettingButton>Settings</OpenDocumentParserSettingButton> and switch to Local or Chatbox AI.'
  )
  t(
    'MinerU API token is required. Please go to <OpenDocumentParserSettingButton>Settings</OpenDocumentParserSettingButton> and configure your MinerU API token.'
  )
  t(
    'This file type requires a document parser. Please go to <OpenDocumentParserSettingButton>Settings</OpenDocumentParserSettingButton> and enable Chatbox AI document parsing.'
  )
}

function _otherI18nKeys(t: (key: string) => string) {
  // src/renderer/routes/settings/route.tsx
  t('Model Provider')
  t('Default Models')
  t('Web Search')
  t('MCP')
  t('Knowledge Base')
  t('Skills')
  t('Document Parser')
  t('Chat Settings')
  t('Keyboard Shortcuts')
  t('General Settings')

  // src/renderer/components/common/MessageLayoutPreview.tsx
  t('Classic')
  t('Bubble')

  // src/renderer/modals/ExportChat.tsx
  t('All threads')
  t('Current thread')

  // src/renderer/components/settings/DocumentParserSettings.tsx
  t('Text Only')
  t('Local')
  t('MinerU')
  t(
    'Only supports basic text files (.txt, .md, .json, code files, etc.). For PDF and Office files, please switch to Chatbox AI.'
  )
  t(
    'Uses built-in document parsing feature, supports common file types. Free usage, no compute points will be consumed.'
  )
  t(
    'Cloud-based document parsing service, supports PDF, Office files, EPUB and many other file types. Consumes compute points.'
  )
  t('Third-party cloud parsing service, supports PDF and most Office files. Requires API token.')

  // src/renderer/components/knowledge-base/KnowledgeBaseForm.tsx
  t('Parser used to process uploaded documents')

  // src/renderer/components/ModelList.tsx
  t('Embedding')
  t('Rerank')
}
