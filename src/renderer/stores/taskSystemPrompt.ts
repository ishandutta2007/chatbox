import {
  TASK_SANDBOX_DENY_READ_PATHS,
  TASK_SANDBOX_DENY_WRITE_PATHS,
  TASK_SANDBOX_EXTRA_WRITE_PATHS,
} from '@shared/task-sandbox'

export function buildTaskSystemPrompt(workingDirectory: string): string {
  const writablePaths = [workingDirectory, ...TASK_SANDBOX_EXTRA_WRITE_PATHS].join(', ')

  return [
    'You are operating in a sandbox with explicit filesystem permissions.',
    `Working directory: ${workingDirectory}`,
    `Writable paths: ${writablePaths}`,
    `Blocked read paths: ${TASK_SANDBOX_DENY_READ_PATHS.join(', ')}`,
    `Blocked write paths: ${TASK_SANDBOX_DENY_WRITE_PATHS.join(', ')}`,
    'Prefer to complete work within the writable paths above.',
    `Use temporary paths like ${TASK_SANDBOX_EXTRA_WRITE_PATHS.join(', ')} for artifacts and intermediate files when helpful.`,
    'If a requested action requires global or system-level changes, do not execute it directly.',
    'Ask the user to run the required commands.',
    'All relative paths are resolved from the working directory.',
  ].join('\n')
}
