export const MatrixNotifications = async ({ project, client, $, directory, worktree }) => {
  const MATRIX_API_URL = process.env.MATRIX_API_URL || 'http://letta-opencode-plugin:3500/matrix';
  
  console.log('[matrix-notifications] Plugin initialized');
  console.log('[matrix-notifications] Project:', project);
  console.log('[matrix-notifications] Directory:', directory);
  
  async function sendNotification(title, message, taskId, status) {
    try {
      const response = await fetch(`${MATRIX_API_URL}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          message,
          taskId,
          status,
          timestamp: new Date().toISOString(),
        }),
      });
      
      if (!response.ok) {
        console.error('[matrix-notifications] Failed to send notification:', response.statusText);
      }
    } catch (error) {
      console.error('[matrix-notifications] Error sending notification:', error.message);
    }
  }
  
  return {
    event: async ({ event }) => {
      console.log('[matrix-notifications] Event received:', event.type);
      
      if (event.type === 'session.idle') {
        await sendNotification(
          'OpenCode Session Completed',
          `Session completed in ${directory}`,
          event.sessionId,
          'completed'
        );
      }
      
      if (event.type === 'session.error') {
        await sendNotification(
          'OpenCode Session Error',
          `Session encountered an error: ${event.error || 'Unknown error'}`,
          event.sessionId,
          'error'
        );
      }
      
      if (event.type === 'message.created') {
        if (event.message?.role === 'assistant') {
          await sendNotification(
            'OpenCode Response',
            `Assistant responded in session ${event.sessionId}`,
            event.sessionId,
            'message'
          );
        }
      }
      
      if (event.type === 'file.edited') {
        await sendNotification(
          'File Edited',
          `File ${event.file} was edited`,
          event.sessionId,
          'file_edit'
        );
      }
    },
  };
};
