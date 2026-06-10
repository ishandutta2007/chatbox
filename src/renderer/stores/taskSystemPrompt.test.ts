import {
  TASK_SANDBOX_DENY_READ_PATHS,
  TASK_SANDBOX_DENY_WRITE_PATHS,
  TASK_SANDBOX_EXTRA_WRITE_PATHS,
} from '@shared/task-sandbox'
import { describe, expect, it } from 'vitest'
import { buildTaskSystemPrompt } from './taskSystemPrompt'

describe('buildTaskSystemPrompt', () => {
  it('includes writable working directory and /tmp permissions', () => {
    const prompt = buildTaskSystemPrompt('/work/project')

    expect(prompt).toContain('Working directory: /work/project')
    expect(prompt).toContain(`Writable paths: /work/project, ${TASK_SANDBOX_EXTRA_WRITE_PATHS.join(', ')}`)
  })

  it('includes blocked read and write paths from sandbox policy', () => {
    const prompt = buildTaskSystemPrompt('/work/project')

    expect(prompt).toContain(`Blocked read paths: ${TASK_SANDBOX_DENY_READ_PATHS.join(', ')}`)
    expect(prompt).toContain(`Blocked write paths: ${TASK_SANDBOX_DENY_WRITE_PATHS.join(', ')}`)
  })

  it('instructs the model to ask the user for global or system-level actions', () => {
    const prompt = buildTaskSystemPrompt('/work/project')

    expect(prompt).toContain('If a requested action requires global or system-level changes')
    expect(prompt).toContain('Ask the user to run the required commands')
  })
})
