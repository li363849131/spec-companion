import React, { useState } from 'react';
import { TestTube, AlertCircle, CheckCircle, Loader, Trash2 } from 'lucide-react';

interface R2TestResult {
  step: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  details?: any;
  timestamp: string;
}

// AWS Signature V4 signing helpers
async function sha256(message: string): Promise<ArrayBuffer> {
  const msgBuffer = new TextEncoder().encode(message);
  return await crypto.subtle.digest('SHA-256', msgBuffer);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function generateSignatureV4(
  method: string,
  url: string,
  headers: Record<string, string>,
  payload: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string = 'auto'
): Promise<string> {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const path = urlObj.pathname;
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Step 1: Create canonical request
  const payloadHash = hex(await sha256(payload));
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Step 2: Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = hex(await sha256(canonicalRequest));
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  // Step 3: Calculate signature
  let kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  let kRegion = await hmac(kDate, region);
  let kService = await hmac(kRegion, service);
  let kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(stringToSign)));

  // Step 4: Build authorization header
  return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export const R2TestPanel: React.FC = () => {
  const [logs, setLogs] = useState<R2TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [config] = useState({
    accountId: '1ae1c488589174c90cf5ded822766a56',
    bucketName: 'spec',
    accessKeyId: '104728a9c9734593c4086fb07383858e',
    secretAccessKey: '94d111f5c8cfcd8ff044ad15294dcda30f4c03c4e1ec64b82474312eee10504a',
    endpoint: 'https://1ae1c488589174c90cf5ded822766a56.r2.cloudflarestorage.com',
  });

  const addLog = (step: string, status: R2TestResult['status'], message: string, details?: any) => {
    setLogs((prev) => [
      ...prev,
      { step, status, message, details, timestamp: new Date().toISOString() },
    ]);
  };

  const testR2Connection = async () => {
    setLogs([]);
    setIsRunning(true);

    try {
      // Step 1: 验证配置
      addLog('配置验证', 'pending', '检查 R2 配置参数...');
      if (!config.accountId || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
        addLog('配置验证', 'error', '缺少必要的 R2 配置参数');
        setIsRunning(false);
        return;
      }
      addLog('配置验证', 'success', '配置参数完整', config);

      // Step 2: 生成测试文件
      addLog('生成测试文件', 'pending', '创建测试用的 Blob...');
      const testContent = `R2 Upload Test - ${new Date().toISOString()}`;
      const testFileName = `test/upload-test-${Date.now()}.txt`;
      addLog('生成测试文件', 'success', `测试文件：${testFileName} (${testContent.length} bytes)`);

      // Step 3: 构建 S3 API 请求（AWS Signature V4）
      addLog('生成 AWS 签名', 'pending', '计算 AWS Signature V4...');
      const url = `${config.endpoint}/${config.bucketName}/${testFileName}`;
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');

      const payloadHash = hex(await sha256(testContent));

      const headers: Record<string, string> = {
        'Host': new URL(url).hostname,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Content-Type': 'text/plain',
      };

      const authorization = await generateSignatureV4(
        'PUT',
        url,
        headers,
        testContent,
        config.accessKeyId,
        config.secretAccessKey
      );

      headers['Authorization'] = authorization;

      addLog('生成 AWS 签名', 'success', '签名计算完成', { url, headers: { ...headers, Authorization: authorization.slice(0, 60) + '...' } });

      // Step 4: 发送 PUT 请求上传
      addLog('上传文件', 'pending', `PUT ${testFileName} 到 R2...`);

      try {
        const uploadResponse = await fetch(url, {
          method: 'PUT',
          headers,
          body: testContent,
        });

        const uploadResponseText = await uploadResponse.text();

        if (!uploadResponse.ok) {
          addLog('上传文件', 'error', `上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`, {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            headers: Object.fromEntries(uploadResponse.headers.entries()),
            body: uploadResponseText,
          });
          setIsRunning(false);
          return;
        }

        addLog('上传文件', 'success', `上传成功 (${uploadResponse.status})`, {
          etag: uploadResponse.headers.get('etag'),
          contentLength: uploadResponse.headers.get('content-length'),
        });

        // Add to uploaded files list
        setUploadedFiles((prev) => [...prev, testFileName]);
      } catch (uploadErr: any) {
        addLog('上传文件', 'error', `上传异常: ${uploadErr.message}`, {
          error: uploadErr.toString(),
          name: uploadErr.name,
          message: uploadErr.message,
        });
        setIsRunning(false);
        return;
      }

      // Step 5: 下载验证
      addLog('下载验证', 'pending', `GET ${testFileName} 验证上传...`);
      try {
        const getAmzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
        const getHeaders: Record<string, string> = {
          'Host': new URL(url).hostname,
          'x-amz-content-sha256': hex(await sha256('')),
          'x-amz-date': getAmzDate,
        };

        const getAuth = await generateSignatureV4('GET', url, getHeaders, '', config.accessKeyId, config.secretAccessKey);
        getHeaders['Authorization'] = getAuth;

        const downloadResponse = await fetch(url, { method: 'GET', headers: getHeaders });

        if (!downloadResponse.ok) {
          addLog('下载验证', 'error', `下载失败: ${downloadResponse.status}`, {
            status: downloadResponse.status,
            statusText: downloadResponse.statusText,
          });
        } else {
          const downloadedContent = await downloadResponse.text();
          const matches = downloadedContent === testContent;
          addLog('下载验证', matches ? 'success' : 'error', matches ? '内容校验通过' : '内容不匹配', {
            expected: testContent,
            actual: downloadedContent,
          });
        }
      } catch (downloadErr: any) {
        addLog('下载验证', 'error', `下载异常: ${downloadErr.message}`);
      }

      addLog('测试完成', 'success', `文件已保留在 R2: ${testFileName}`);
    } catch (err: any) {
      addLog('测试失败', 'error', err.message, { error: err.toString() });
    } finally {
      setIsRunning(false);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    try {
      const url = `${config.endpoint}/${config.bucketName}/${fileName}`;
      const deleteAmzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const deleteHeaders: Record<string, string> = {
        'Host': new URL(url).hostname,
        'x-amz-content-sha256': hex(await sha256('')),
        'x-amz-date': deleteAmzDate,
      };

      const deleteAuth = await generateSignatureV4('DELETE', url, deleteHeaders, '', config.accessKeyId, config.secretAccessKey);
      deleteHeaders['Authorization'] = deleteAuth;

      const deleteResponse = await fetch(url, { method: 'DELETE', headers: deleteHeaders });

      if (deleteResponse.ok) {
        addLog('手动删除', 'success', `已删除: ${fileName}`);
        setUploadedFiles((prev) => prev.filter((f) => f !== fileName));
      } else {
        addLog('手动删除', 'error', `删除失败: ${deleteResponse.status}`);
      }
    } catch (err: any) {
      addLog('手动删除', 'error', `删除异常: ${err.message}`);
    }
  };

  const handleDeleteAllUserFiles = async () => {
    if (!confirm('确定要删除当前用户（user_jerry）的所有测试文件和分析结果吗？这将删除所有分类目录下的 PDF 和研读结果。')) {
      return;
    }

    setLogs([]);
    setIsRunning(true);

    try {
      addLog('删除用户文件', 'pending', '查询当前用户的所有文件...');

      // List all objects
      const url = `${config.endpoint}/${config.bucketName}/`;
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const headers: Record<string, string> = {
        'Host': new URL(url).hostname,
        'x-amz-content-sha256': hex(await sha256('')),
        'x-amz-date': amzDate,
      };
      const authorization = await generateSignatureV4('GET', url, headers, '', config.accessKeyId, config.secretAccessKey);
      headers['Authorization'] = authorization;

      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        addLog('删除用户文件', 'error', `查询失败: ${response.status}`);
        setIsRunning(false);
        return;
      }

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const contents = xmlDoc.getElementsByTagName('Contents');
      const allKeys = [];
      for (let i = 0; i < contents.length; i++) {
        const keyNode = contents[i].getElementsByTagName('Key')[0];
        if (keyNode) allKeys.push(keyNode.textContent || '');
      }

      console.log('All keys in R2:', allKeys);

      // Filter files: test files + PDFs in category directories + all analysis results + metadata files
      const userFiles = allKeys.filter(key =>
        key.startsWith('test/') || // test files
        key.endsWith('.pdf') || // all PDFs (in category directories)
        key.startsWith('analysis/') || // all analysis files
        key.startsWith('metadata/') // metadata JSON files
      );

      console.log('Filtered user files:', userFiles);
      console.log('Filter conditions:');
      allKeys.forEach(key => {
        console.log(`  ${key}:`, {
          'test/': key.startsWith('test/'),
          '.pdf': key.endsWith('.pdf'),
          '_user_jerry.json': key.includes('_user_jerry.json'),
          'metadata/': key.startsWith('metadata/'),
        });
      });

      if (userFiles.length === 0) {
        addLog('删除用户文件', 'success', '没有找到当前用户的文件');
        setIsRunning(false);
        return;
      }

      addLog('删除用户文件', 'pending', `找到 ${userFiles.length} 个文件，开始删除...`);

      let deletedCount = 0;
      for (const key of userFiles) {
        try {
          const deleteUrl = `${config.endpoint}/${config.bucketName}/${key}`;
          const deleteAmzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
          const deleteHeaders: Record<string, string> = {
            'Host': new URL(deleteUrl).hostname,
            'x-amz-content-sha256': hex(await sha256('')),
            'x-amz-date': deleteAmzDate,
          };
          const deleteAuth = await generateSignatureV4('DELETE', deleteUrl, deleteHeaders, '', config.accessKeyId, config.secretAccessKey);
          deleteHeaders['Authorization'] = deleteAuth;

          const deleteResponse = await fetch(deleteUrl, { method: 'DELETE', headers: deleteHeaders });
          if (deleteResponse.ok) {
            deletedCount++;
          }
        } catch (err) {
          console.warn('Failed to delete:', key, err);
        }
      }

      addLog('删除用户文件', 'success', `已删除 ${deletedCount}/${userFiles.length} 个文件`);
      setUploadedFiles([]);
    } catch (err: any) {
      addLog('删除用户文件', 'error', `删除异常: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleListObjects = async () => {
    setLogs([]);
    setIsRunning(true);

    try {
      addLog('列出对象', 'pending', '查询存储桶里的所有对象...');
      const url = `${config.endpoint}/${config.bucketName}/`;

      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');

      const headers: Record<string, string> = {
        'Host': new URL(url).hostname,
        'x-amz-content-sha256': hex(await sha256('')),
        'x-amz-date': amzDate,
      };

      const authorization = await generateSignatureV4('GET', url, headers, '', config.accessKeyId, config.secretAccessKey);
      headers['Authorization'] = authorization;

      const response = await fetch(url, { method: 'GET', headers });

      if (!response.ok) {
        const errorText = await response.text();
        addLog('列出对象', 'error', `查询失败: ${response.status}`, { status: response.status, body: errorText });
        setIsRunning(false);
        return;
      }

      const xmlText = await response.text();
      addLog('列出对象', 'success', 'XML 响应已接收', { xml: xmlText });

      // Parse XML to extract object keys
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const contents = xmlDoc.getElementsByTagName('Contents');
      const keys = [];
      for (let i = 0; i < contents.length; i++) {
        const keyNode = contents[i].getElementsByTagName('Key')[0];
        if (keyNode) keys.push(keyNode.textContent || '');
      }

      if (keys.length === 0) {
        addLog('列出对象', 'success', '存储桶是空的（0 个对象）');
      } else {
        addLog('列出对象', 'success', `找到 ${keys.length} 个对象`, { keys });
        setUploadedFiles(keys);
      }
    } catch (err: any) {
      addLog('列出对象', 'error', `查询异常: ${err.message}`, { error: err.toString() });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-900 text-slate-100 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center space-x-2">
          <TestTube className="w-6 h-6" />
          <span>R2 存储连接测试</span>
        </h1>
        <div className="flex space-x-2">
          <button
            onClick={handleListObjects}
            disabled={isRunning}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded flex items-center space-x-2 transition"
          >
            {isRunning ? <Loader className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            <span>列出所有对象</span>
          </button>
          <button
            onClick={handleDeleteAllUserFiles}
            disabled={isRunning}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded flex items-center space-x-2 transition"
          >
            {isRunning ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>删除当前用户所有文件</span>
          </button>
          <button
            onClick={testR2Connection}
            disabled={isRunning}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded flex items-center space-x-2 transition"
          >
            {isRunning ? <Loader className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            <span>{isRunning ? '测试中...' : '上传测试'}</span>
          </button>
        </div>
      </div>

      {/* Config Display */}
      <div className="bg-slate-800 p-4 rounded space-y-2">
        <h2 className="font-semibold text-sm text-slate-400">当前配置</h2>
        <div className="text-xs font-mono space-y-1">
          <div>Account ID: {config.accountId}</div>
          <div>Bucket: {config.bucketName}</div>
          <div>Access Key: {config.accessKeyId.slice(0, 8)}...</div>
          <div>Endpoint: {config.endpoint}</div>
        </div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="bg-slate-800 p-4 rounded space-y-2">
          <h2 className="font-semibold text-sm text-slate-400">已上传的测试文件</h2>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div key={file} className="flex items-center justify-between text-xs bg-slate-900 p-2 rounded">
                <span className="font-mono flex-1 truncate">{file}</span>
                <button
                  onClick={() => handleDeleteFile(file)}
                  className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="space-y-2">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className={`p-4 rounded border ${
              log.status === 'success'
                ? 'bg-green-900/20 border-green-700'
                : log.status === 'error'
                ? 'bg-red-900/20 border-red-700'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                {log.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : log.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Loader className="w-5 h-5 text-slate-400 animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-sm">{log.step}</h3>
                  <span className="text-xs text-slate-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-1">{log.message}</p>
                {log.details && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                      详细信息
                    </summary>
                    <pre className="mt-2 p-2 bg-slate-950 rounded text-xs overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {logs.length === 0 && !isRunning && (
        <div className="text-center text-slate-500 py-12">
          点击"开始测试"按钮测试 R2 连接
        </div>
      )}
    </div>
  );
};
