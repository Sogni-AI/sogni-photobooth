# Sogni Photobooth Backend Server

This server provides secure API endpoints for the Sogni Photobooth application, protecting sensitive credentials from being exposed in the frontend code.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the server directory with your Sogni credentials:
```
# Sogni Client credentials
SOGNI_APP_ID=your-app-id
SOGNI_USERNAME=your-username
SOGNI_PASSWORD=your-password
SOGNI_ENV=production

# Server config
PORT=3001
CLIENT_ORIGIN=https://photobooth-local.sogni.ai

# Gallery Moderation (optional)
# Set to 'false' to disable moderation and auto-approve all gallery submissions
# MODERATION_ENABLED=true
```

3. Start the server:
```bash
npm run dev
```

The server will automatically find an available port if 3001 is already in use.

## API Endpoints

### Health Check
```
GET /api/health
```
Returns a detailed status to confirm the server is running, including environment information.

### Debug Info
```
GET /api/debug
```
Returns detailed debug information about the server environment (for troubleshooting).

### Sogni Status
```
GET /api/sogni/status
```
Tests the connection to Sogni services and returns status information.

**Request Headers:**
```
X-Client-App-ID: your-client-app-id (optional, for reusing connections)
```

**Response:**
```json
{
  "connected": true,
  "appId": "sogni-client-appid",
  "network": "fast",
  "authenticated": true
}
```

### Generate Image
```
POST /api/sogni/generate
```
Initiates image generation with the Sogni API.

**Request Headers:**
```
X-Client-App-ID: your-client-app-id (optional, for reusing connections)
Content-Type: application/json
```

**Request Body:**
```json
{
  "selectedModel": "model-id",
  "stylePrompt": "style description",
  "width": 768,
  "height": 768,
  "promptGuidance": 2,
  "numberImages": 4,
  "controlNetStrength": 0.7,
  "controlNetGuidanceEnd": 0.6,
  "imageData": [0, 0, 0, ...], // Array of image bytes
  "clientAppId": "your-client-app-id" // Optional, same as header
}
```

**Response:**
```json
{
  "status": "processing",
  "projectId": "project-123456789",
  "message": "Image generation started"
}
```

### Progress Updates
```
GET /api/sogni/progress/:projectId
```
Server-Sent Events (SSE) endpoint for real-time progress updates.

**Query Parameters:**
```
clientAppId=your-client-app-id (optional, for reusing connections)
```

**Event Types:**
- `connected`: Initial connection confirmation
- `progress`: Job progress update (0.0 to 1.0)
- `jobCompleted`: Individual image generation completed
- `jobFailed`: Individual image generation failed
- `complete`: All images in the project completed
- `error`: Project-level error

### Cancel Project
```
POST /api/sogni/cancel/:projectId
```
Cancels an ongoing generation project.

**Request Headers:**
```
X-Client-App-ID: your-client-app-id (optional, for reusing connections)
Content-Type: application/json
```

**Response:**
```json
{
  "status": "cancelled",
  "projectId": "project-123456789"
}
```

### Disconnect Session
```
POST /api/sogni/disconnect
```
Explicitly disconnects a client session to clean up WebSocket connections.

**Request Headers:**
```
X-Client-App-ID: your-client-app-id (optional, for reusing connections)
Content-Type: application/json
```

**Request Body:**
```json
{
  "clientAppId": "your-client-app-id" // Optional, same as header
}
```

**Response:**
```json
{
  "success": true
}
```

## Session Handling

The server implements automatic session management to track client connections:

1. **Session Cookies**: A secure cookie (`sogni_session_id`) is created for each client
2. **Client Tracking**: Each session is associated with a Sogni client instance
3. **Connection Reuse**: The same WebSocket connection is reused across requests from the same session
4. **Automatic Cleanup**: Idle sessions are automatically cleaned up after a timeout period

Benefits:
- Reduces redundant connections to the Sogni API
- Maintains WebSocket connection state between requests
- Properly handles client cleanup when sessions end
- Improves performance by reusing authentication

## Troubleshooting

### Invalid Credentials Error

If you're seeing an "Invalid credentials" error in the server logs or "Authentication failed" in the API responses, follow these steps:

1. **Check your Sogni credentials:** Verify that the username and password in your `.env` file are correct.

2. **Create or update the .env file:** Make sure you have a file named `.env` (with the dot) in the `server` directory with these contents:
   ```
   # Sogni Client credentials
   SOGNI_APP_ID=your-actual-app-id
   SOGNI_USERNAME=your-actual-username
   SOGNI_PASSWORD=your-actual-password
   SOGNI_ENV=production
   
   # Server config
   PORT=3001
   CLIENT_ORIGIN=https://photobooth-local.sogni.ai
   ```

3. **Restart the server:** After updating the .env file, restart the server to apply the changes:
   ```bash
   npm run dev
   ```

4. **Test the credentials manually:** You can test your Sogni credentials directly using the provided test script:
   ```bash
   node test-auth.js
   ```

### Port Conflicts

The server now automatically finds an available port if the default port (3001) is in use. However, if you need to specify a particular port:

1. Update the `PORT` value in your `.env` file
2. Ensure nginx is configured to proxy to the correct port in `/opt/homebrew/etc/nginx/servers/photobooth-local.sogni.ai.conf`
3. Run `./update-nginx.sh` to update the nginx configuration

### Nginx Configuration

If you see 502 Bad Gateway or 504 Gateway Timeout errors:

1. Make sure the server is running
2. Update the nginx configuration with the latest settings:
   ```bash
   ./scripts/run.sh nginx
   ```
   This will:
   - Configure Nginx to proxy requests from standard ports (80/443) to internal development servers
   - Set appropriate timeout values
   - Add detailed logging

The Nginx configuration handles:
- HTTP to HTTPS redirection (port 80 → 443)
- Proxying HTTPS requests on standard port (443) to internal services:
  - Frontend requests → Vite dev server (port 5175)
  - API requests (/api/*) → Backend server (port 3001)

This means users can access the application at `https://photobooth-local.sogni.ai` without any port numbers.

### CORS Issues

If you're getting CORS errors when the frontend tries to communicate with the backend:

1. **Check Origin Configuration**: Ensure `CLIENT_ORIGIN` in your `.env` file matches your frontend origin
2. **Request Headers**: Make sure frontend requests include `credentials: 'include'` to send cookies
3. **CORS Headers**: The server adds these headers for cross-origin requests:
   ```
   Access-Control-Allow-Origin: [matching the request origin]
   Access-Control-Allow-Credentials: true
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   Access-Control-Allow-Headers: Content-Type, X-Client-App-ID, Accept
   ```
4. **Preflight Requests**: For OPTIONS requests, the server returns 204 No Content with appropriate CORS headers
5. **Cookie Issues**: For cross-domain HTTPS, ensure cookies use `SameSite=None; Secure=true`

## Testing and Diagnostics

For testing the Sogni API credentials directly:
```bash
cd server
node test-auth.js
```

For updating your environment settings:
```bash
cd server
./update-env.sh
```

## Frontend Integration

The frontend should use the API service to communicate with these endpoints instead of directly using the Sogni SDK. This ensures sensitive credentials are kept secure on the server.

### Integration Steps:

1. **API Service**: Create a frontend service that handles API communication:
   ```javascript
   // Example of API service in frontend (api.ts)
   const API_URL = '/api';
   
   // Get client app ID from cookie or generate one
   const getClientAppId = () => {
     // Check for existing cookie or generate UUID
     return clientAppId;
   };
   
   // Status Check
   export async function checkStatus() {
     const response = await fetch(`${API_URL}/sogni/status`, {
       credentials: 'include',
       headers: {
         'X-Client-App-ID': getClientAppId()
       }
     });
     return response.json();
   }
   
   // Generate Images
   export async function generateImages(params) {
     const response = await fetch(`${API_URL}/sogni/generate`, {
       method: 'POST',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json',
         'X-Client-App-ID': getClientAppId()
       },
       body: JSON.stringify({
         ...params,
         clientAppId: getClientAppId()
       })
     });
     return response.json();
   }
   ```

2. **Progress Tracking**: Use EventSource for real-time updates:
   ```javascript
   function trackProgress(projectId, callbacks) {
     const eventSource = new EventSource(
       `${API_URL}/sogni/progress/${projectId}?clientAppId=${getClientAppId()}`,
       { withCredentials: true }
     );
     
     eventSource.onmessage = (event) => {
       const data = JSON.parse(event.data);
       // Handle different event types
       if (data.type === 'progress') callbacks.onProgress(data);
       else if (data.type === 'complete') {
         callbacks.onComplete(data);
         eventSource.close();
       }
       // ...handle other event types
     };
     
     return {
       cancel: () => eventSource.close()
     };
   }
   ```

3. **Client Cleanup**: Implement disconnect on page unload:
   ```javascript
   window.addEventListener('beforeunload', () => {
     // Use navigator.sendBeacon for reliable unload requests
     if (navigator.sendBeacon) {
       navigator.sendBeacon(
         `${API_URL}/sogni/disconnect`,
         JSON.stringify({ clientAppId: getClientAppId() })
       );
     }
   });
   ```

## Deployment

For production deployment, build the frontend with:
```bash
cd ..
npm run build
```

Then deploy both the frontend static files and this backend server to your hosting environment. 

When deploying:
1. Set up appropriate environment variables on the server
2. Configure your web server (Nginx, Apache) to proxy API requests to the Node.js server
3. Ensure WebSocket connections are properly supported in your hosting environment
4. Configure appropriate CORS settings for your production domains 