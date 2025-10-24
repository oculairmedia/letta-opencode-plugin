export const createOpencodeClient = jest.fn().mockReturnValue({
  session: {
    create: jest.fn().mockResolvedValue({ id: 'mock-session-id' }),
    get: jest.fn().mockResolvedValue({ id: 'mock-session-id', status: 'active' }),
    prompt: jest.fn().mockResolvedValue({}),
    abort: jest.fn().mockResolvedValue({}),
  },
  event: {
    subscribe: jest.fn().mockResolvedValue({
      stream: {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'session.idle', properties: { sessionId: 'mock-session-id' } };
        },
      },
    }),
  },
  file: {
    read: jest.fn().mockResolvedValue({ content: 'mock file content' }),
    status: jest.fn().mockResolvedValue([{ path: '/workspace/test.txt' }]),
  },
});
