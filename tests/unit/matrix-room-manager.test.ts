import { MatrixRoomManager } from '../../src/matrix-room-manager.js';
import type { MatrixClientWrapper } from '../../src/matrix-client.js';

describe('MatrixRoomManager.closeTaskRoom', () => {
  const roomId = '!room:example.test';
  const taskId = 'task-123';

  it('sends the completion summary as HTML when Matrix accepts rich content', async () => {
    const sendHtmlMessage = jest.fn().mockResolvedValue('event-id');
    const sendMessage = jest.fn();

    const matrixClient = {
      sendHtmlMessage,
      sendMessage,
    } as unknown as MatrixClientWrapper;

    const manager = new MatrixRoomManager(matrixClient);

    const summary = '✅ Task Completed Successfully\n\nOutput:\n<script>alert("x")</script>';

    await manager.closeTaskRoom(roomId, taskId, summary);

    expect(sendHtmlMessage).toHaveBeenCalledTimes(1);
    expect(sendHtmlMessage).toHaveBeenCalledWith(
      roomId,
      summary,
      '<h3>✅ Task Completed Successfully</h3><p>Output:<br>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p><p><em>This room will remain available for review.</em></p>',
      {
        'io.letta.task': {
          task_id: taskId,
          event_type: 'task_completed',
        },
      }
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to plain text when Matrix rejects HTML content', async () => {
    const sendHtmlMessage = jest.fn().mockRejectedValue(new Error('HTML not supported'));
    const sendMessage = jest.fn().mockResolvedValue('event-id');

    const matrixClient = {
      sendHtmlMessage,
      sendMessage,
    } as unknown as MatrixClientWrapper;

    const manager = new MatrixRoomManager(matrixClient);

    const summary = '✅ Task Completed Successfully\n\nPlain text only';

    await manager.closeTaskRoom(roomId, taskId, summary);

    expect(sendHtmlMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(roomId, summary, {
      'io.letta.task': {
        task_id: taskId,
        event_type: 'task_completed',
      },
    });
  });
});
