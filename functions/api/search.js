/**
 * GET /api/search?q=xxx
 * 搜索图片（按文件名和游戏名模糊匹配）
 */

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.tiff', '.tif',
]);

function isImageFile(key) {
  const dotIndex = key.lastIndexOf('.');
  if (dotIndex === -1) return false;
  return IMAGE_EXTENSIONS.has(key.slice(dotIndex).toLowerCase());
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export async function onRequestGet(context) {
  try {
    const bucket = context.env.R2_BUCKET;
    const url = new URL(context.request.url);
    const query = (url.searchParams.get('q') || '').toLowerCase().trim();

    if (!query) {
      return new Response(JSON.stringify({ images: [], query: '', total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const images = [];
    let cursor = undefined;
    const MAX_SCAN = 5000; // 最多扫描 5000 个对象
    const MAX_RESULTS = 200; // 最多返回 200 条结果
    let scanned = 0;

    while (scanned < MAX_SCAN && images.length < MAX_RESULTS) {
      const listed = await bucket.list({ cursor, limit: 1000 });

      for (const obj of listed.objects) {
        scanned++;
        if (isImageFile(obj.key) && obj.key.toLowerCase().includes(query)) {
          const slashIndex = obj.key.indexOf('/');
          const gameName = slashIndex !== -1 ? obj.key.slice(0, slashIndex) : '';
          const fileName = slashIndex !== -1 ? obj.key.slice(slashIndex + 1) : obj.key;

          images.push({
            key: obj.key,
            game: gameName,
            name: fileName,
            size: obj.size,
            sizeFormatted: formatSize(obj.size),
            uploaded: obj.uploaded?.toISOString() || null,
          });

          if (images.length >= MAX_RESULTS) break;
        }
      }

      if (!listed.truncated) break;
      cursor = listed.cursor;
    }

    return new Response(JSON.stringify({
      images,
      query,
      total: images.length,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Search failed', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
