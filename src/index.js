export default {
	async fetch(request, env, ctx) {
		return await handleRequest(request, env);
	},
};

async function handleRequest(request, env) {
	if (request.method !== 'POST') {
		return errHandler(405, 'Method Not Allowed');
	}

	let req;
	try {
		req = await request.json();
	} catch (error) {
		return errHandler(400, 'Invalid JSON');
	}

	const { action, url, api_key } = req;
	if (env.API_KEY && api_key !== env.API_KEY) {
		return errHandler(401, 'Unauthorized');
	}

	if (!url) {
		return errHandler(400, 'URL is required');
	}

	switch (action) {
		case 'get':
			return getImage(url);
		case 'get16kb':
			return getImage16kb(url);
		case 'base64':
			return getImageBase64(url);
		case 'base64_16kb':
			return getImageBase64_16kb(url);
		default:
			return errHandler(400, 'Invalid action');
	}
}

async function getImage(url) {
	const response = await fetch(url);
	if (!response.ok) {
		return errHandler(response.status, response.statusText);
	}
	return new Response(response.body, { headers: response.headers, status: response.status, statusText: response.statusText });
}

async function getImage16kb(url) {
	const response = await fetch(url);
	if (!response.ok) {
		return errHandler(response.status, response.statusText);
	}

	const chunksAll = await handleImage16kb(response);

	// 返回处理后的数据
	return new Response(chunksAll, { headers: response.headers, status: response.status, statusText: response.statusText });
}

async function handleImage16kb(response) {
	const reader = response.body.getReader();
	let receivedLength = 0; // 已接收的字节数
	let chunks = []; // 接收到的数据块数组
	const maxBytes = 16 * 1024; // 最大字节数，16KB

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(value);
		receivedLength += value.length;
		if (receivedLength >= maxBytes) {
			// 如果达到或超过16KB，则停止读取
			break;
		}
	}

	// 合并Uint8Array
	let chunksAll = new Uint8Array(receivedLength); // 创建一个新的、足够大的数组来容纳所有数据
	let position = 0;
	for (let chunk of chunks) {
		chunksAll.set(chunk, position); // 将数据块复制到chunksAll中
		position += chunk.length;
	}

	return chunksAll;
}

async function getImageBase64(url) {
	const response = await fetch(url);
	if (!response.ok) {
		return errHandler(response.status, response.statusText);
	}

	// 首先判断是否是图片
	let contentType = response.headers.get('content-type');
	if (!contentType.startsWith('image')) {
		contentType = '';
	}

	const buffer = await response.arrayBuffer();
	const base64 = await arrayBufferToBase64(buffer);

	return new Response(
		JSON.stringify({
			status: true,
			data: base64,
			mimeType: contentType,
		}),
		{ status: 200, contentType: 'application/json' }
	);
}

async function getImageBase64_16kb(url) {
	const response = await fetch(url);
	if (!response.ok) {
		return errHandler(response.status, response.statusText);
	}

	let contentType = response.headers.get('content-type');
	if (!contentType.startsWith('image')) {
		contentType = '';
	}

	const chunksAll = await handleImage16kb(response);
	const base64 = await arrayBufferToBase64(chunksAll);

	return new Response(
		JSON.stringify({
			status: true,
			data: base64,
			mimeType: contentType,
		}),
		{ status: 200, contentType: 'application/json' }
	);
}

function errHandler(statusCode, msg) {
	return new Response(
		JSON.stringify({
			status: false,
			message: msg,
		}),
		{ status: statusCode, contentType: 'application/json' }
	);
}

async function arrayBufferToBase64(buffer) {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;

	for (let i = 0; i < len; i += 1024) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 1024, len)));
	}

	return btoa(binary);
}
