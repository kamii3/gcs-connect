const dns = require('dns');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const axios = require('/home/ikram/.npm/_npx/a7204b5813574340/node_modules/axios');

// Enforce IPv4
dns.setDefaultResultOrder('ipv4first');
http.globalAgent.options.family = 4;
https.globalAgent.options.family = 4;

const TOKEN = process.env.HOSTINGER_API_TOKEN || 'C98Js943i2wv0iUh2hLFjXoZ37njXm4UhR56rLT244be0c0d';
const USERNAME = 'u797749929';
const DOMAIN = 'chat.globalcrestsolutions.com';
const ARCHIVE_PATH = path.resolve(__dirname, '../dist/hostinger-upload.zip');

async function main() {
  console.log(`[Deploy] Target domain: ${DOMAIN}`);
  console.log(`[Deploy] Archive path: ${ARCHIVE_PATH}`);

  if (!fs.existsSync(ARCHIVE_PATH)) {
    throw new Error(`Archive not found at ${ARCHIVE_PATH}`);
  }
  const stats = fs.statSync(ARCHIVE_PATH);
  const totalBytes = stats.size;
  console.log(`[Deploy] Archive size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${totalBytes} bytes)`);

  let credsRes;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`[Deploy] Step 1/3: Fetching upload credentials from Hostinger API (attempt ${attempt}/5)...`);
      credsRes = await axios.post(
        'https://developers.hostinger.com/api/hosting/v1/files/upload-urls',
        { username: USERNAME, domain: DOMAIN },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: new https.Agent({ family: 4 })
        }
      );
      if (credsRes && credsRes.data && credsRes.data.url) break;
    } catch (e) {
      console.log(`[Deploy] Attempt ${attempt} failed: ${JSON.stringify(e.response?.data || e.message)}`);
      if (attempt === 5) throw e;
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  const { url: uploadUrl, auth_key: authToken, rest_auth_key: authRestToken } = credsRes.data;
  console.log(`[Deploy] Upload URL obtained: ${uploadUrl}`);

  const cleanUploadUrl = uploadUrl.replace(/\/$/, '');
  const normalizedPath = 'hostinger-upload.zip';
  const uploadUrlWithFile = `${cleanUploadUrl}/${normalizedPath}?override=true`;

  console.log('[Deploy] Step 2/3: Pre-upload handshake & streaming file upload...');
  const preHeaders = {
    'X-Auth': authToken,
    'X-Auth-Rest': authRestToken,
    'upload-length': totalBytes.toString(),
    'upload-offset': '0'
  };

  const postRes = await axios.post(uploadUrlWithFile, '', {
    headers: preHeaders,
    timeout: 60000,
    httpsAgent: new https.Agent({ family: 4 }),
    validateStatus: s => s === 201
  });
  console.log('[Deploy] Pre-upload handshake verified (201 Created).');

  const locationHeader = postRes.headers['location'] || `/${normalizedPath}`;
  const patchPath = locationHeader.startsWith('/rest/')
    ? locationHeader
    : `/rest${locationHeader.startsWith('/') ? '' : '/'}${locationHeader}`;
  const parsedBase = new URL(cleanUploadUrl);
  const patchTargetUrl = new URL(patchPath, parsedBase.origin);
  console.log(`[Deploy] Streaming PATCH target: ${patchTargetUrl.toString()}`);

  // Perform streaming PATCH using native https.request
  await new Promise((resolve, reject) => {
    const patchReq = https.request({
      protocol: patchTargetUrl.protocol,
      hostname: patchTargetUrl.hostname,
      port: patchTargetUrl.port || 443,
      path: patchTargetUrl.pathname,
      method: 'PATCH',
      family: 4,
      headers: {
        'X-Auth': authToken,
        'X-Auth-Rest': authRestToken,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': '0',
        'Content-Length': totalBytes.toString(),
        'Tus-Resumable': '1.0.0'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[Deploy] PATCH successful! Status: ${res.statusCode}, Upload-Offset: ${res.headers['upload-offset']}`);
          resolve();
        } else {
          reject(new Error(`PATCH failed with status ${res.statusCode}: ${body}`));
        }
      });
    });

    patchReq.on('error', reject);

    let bytesSent = 0;
    let lastLogged = 0;
    const fileStream = fs.createReadStream(ARCHIVE_PATH);

    fileStream.on('data', chunk => {
      bytesSent += chunk.length;
      const pct = Math.round((bytesSent / totalBytes) * 100);
      if (pct >= lastLogged + 20 || pct === 100) {
        console.log(`[Deploy] Upload streaming: ${pct}% (${(bytesSent / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
        lastLogged = pct;
      }
    });

    fileStream.pipe(patchReq);
  });

  console.log('[Deploy] File upload completed successfully!');
  console.log('[Deploy] Step 3/3: Triggering Node.js build on Hostinger...');

  const buildData = {
    node_version: 22,
    app_type: 'express',
    entry_file: 'server.js',
    build_script: 'build',
    source_type: 'archive',
    source_options: {
      archive_path: 'hostinger-upload.zip'
    }
  };

  const buildRes = await axios.post(
    `https://developers.hostinger.com/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds`,
    buildData,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new https.Agent({ family: 4 })
    }
  );

  console.log('[Deploy] Build triggered successfully!');
  const buildUuid = buildRes.data.uuid || buildRes.data.build_uuid || (buildRes.data.build && buildRes.data.build.uuid);
  console.log(`[Deploy] Build UUID: ${buildUuid}`);
  console.log('[Deploy] Build Details:', JSON.stringify(buildRes.data));
  return buildUuid;
}

main().catch(err => {
  console.error('[Deploy] Error:', err.response?.data || err.message);
  process.exit(1);
});
