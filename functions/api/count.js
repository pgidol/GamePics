/**
 * GET /api/count?game=xxx
 * 返回图片总数，支持按游戏筛选
 */

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.tiff', '.tif',
]);

function isImageFile(key) {
  const dotIndex = key.lastIndexOf('.');
  if (dotIndex === -1) return false;
  return IMAGE_EXTENSIONS.has(key.slice(dotIndex).toLowerCase());
}

export async function onRequestGet(context) {
  try {
    const bucket = context.env.R2_BUCKET;
    const url = new URL(context.request.url);

    const game = url.searchParams.get('game') || '';
    const prefix = game ? `${game}/` : undefined;

    let total = 0;
    let cursor = undefined;

    // 遍历所有对象计数
    while (true) {
      const listOpts = { prefix, limit: 1000 };
      if (cursor) listOpts.cursor = cursor;

      const listed = await bucket.list(listOpts);

      for (const obj of listed.objects) {
        if (isImageFile(obj.key)) {
          total++;
        }
      }

      if (!listed.truncated) break;
      cursor = listed.cursor;
    }

    return new Response(JSON.stringify({ total }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to count images', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
