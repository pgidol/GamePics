/**
 * GET /api/images?game=xxx&after=xxx&limit=30
 * 列出图片，支持游戏筛选和 startAfter 分页
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
    const after = url.searchParams.get('after') || undefined;
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1), 100);

    const prefix = game ? `${game}/` : undefined;
    const images = [];
    let r2Cursor = undefined;
    let isFirstCall = true;
    let exhausted = false;

    // 循环获取，直到收集够 limit 张图片或没有更多数据
    while (images.length < limit) {
      const listOpts = { prefix, limit: 200 };

      if (isFirstCall && after) {
        // 首次调用：用 startAfter 跳过已返回的图片（对象级精度）
        listOpts.startAfter = after;
      } else if (!isFirstCall) {
        // 同一次 API 请求内的后续 R2 调用：用 R2 内部游标继续
        listOpts.cursor = r2Cursor;
      }

      const listed = await bucket.list(listOpts);
      isFirstCall = false;

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

          if (images.length >= limit) break;
        }
      }

      // 已收集够图片，可能还有更多
      if (images.length >= limit) break;

      // R2 没有更多数据了
      if (!listed.truncated) {
        exhausted = true;
        break;
      }

      r2Cursor = listed.cursor;
    }

    // 判断是否还有更多：如果收集到了 limit 张则认为可能还有，
    // 如果已经遍历完所有 R2 数据则确定没有了
    const hasMore = !exhausted && images.length >= limit;
    const lastKey = images.length > 0 ? images[images.length - 1].key : null;

    return new Response(JSON.stringify({
      images,
      nextAfter: hasMore ? lastKey : null,
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
