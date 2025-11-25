import NiceModal from '@ebay/nice-modal-react'
import Welcome from './Welcome'
import ProviderSelector from './ProviderSelector'
import SessionSettings from './SessionSettings'
import AppStoreRating from './AppStoreRating'
import ArtifactPreview from './ArtifactPreview'
import ClearSessionList from './ClearSessionList'
import EdgeOneDeploySuccess from './EdgeOneDeploySuccess'
import ExportChat from './ExportChat'
import MessageEdit from './MessageEdit'
import AttachLink from './AttachLink'
import JsonViewer from './JsonViewer'
import ModelEdit from './ModelEdit'
import OcrContentViewer from './OcrContentViewer'
import ThreadNameEdit from './ThreadNameEdit'
import ReportContent from './ReportContent'

NiceModal.register('welcome', Welcome)
NiceModal.register('provider-selector', ProviderSelector)
NiceModal.register('session-settings', SessionSettings)
NiceModal.register('app-store-rating', AppStoreRating)
NiceModal.register('artifact-preview', ArtifactPreview)
NiceModal.register('clear-session-list', ClearSessionList)
NiceModal.register('export-chat', ExportChat)
NiceModal.register('message-edit', MessageEdit)
NiceModal.register('json-viewer', JsonViewer)
NiceModal.register('attach-link', AttachLink)
NiceModal.register('report-content', ReportContent)
NiceModal.register('model-edit', ModelEdit)
NiceModal.register('thread-name-edit', ThreadNameEdit)
NiceModal.register('ocr-content-viewer', OcrContentViewer)
NiceModal.register('edgeone-deploy-success', EdgeOneDeploySuccess)
