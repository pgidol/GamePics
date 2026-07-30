/**
 * GET /api/images?game=xxx&cursor=xxx&limit=30
 * 列出图片，支持游戏筛选和游标分页
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

    const game = url.searchParams.get('game') || '';
    const cursor = url.searchParams.get('cursor') || undefined;
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1), 100);

    const prefix = game ? `${game}/` : undefined;
    const images = [];
    let currentCursor = cursor;
    let hasMore = false;

    // 循环获取，直到收集够 limit 张图片或没有更多数据
    while (images.length < limit) {
      const listed = await bucket.list({
        prefix,
        cursor: currentCursor,
        limit: 200,
      });

      let reachedLimit = false;
      for (const obj of listed.objects) {
        if (isImageFile(obj.key)) {
          // 从 key 中提取游戏名和文件名
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

          if (images.length >= limit) {
            reachedLimit = true;
            break;
          }
        }
      }

      // 已收集够图片 — 仍有更多可加载
      if (reachedLimit) {
        hasMore = true;
        // 保留当前游标供下次分页使用
        currentCursor = listed.truncated ? listed.cursor : currentCursor;
        break;
      }

      // 本批次没有更多数据了
      if (!listed.truncated) {
        hasMore = false;
        currentCursor = null;
        break;
      }

      currentCursor = listed.cursor;
      hasMore = true;
    }

    return new Response(JSON.stringify({
      images,
      cursor: hasMore ? currentCursor : null,
      hasMore,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to list images', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
