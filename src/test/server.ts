/**
 * MSW Node server — shared across all integration tests.
 * Started in beforeAll, reset in afterEach, closed in afterAll.
 */
import { setupServer } from 'msw/node'
import { handlers }    from './handlers'

export const server = setupServer(...handlers)
