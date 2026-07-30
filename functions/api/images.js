/**
 * GET /api/images?game=xxx&pageToken=xxx&limit=30
 * 列出图片，支持游戏筛选和分页
 *
 * 分页策略：复合游标（compound cursor）
 * 将 R2 批次游标 + 已处理对象数 编码为 base64 令牌，
 * 下次请求时重新获取同一批次并跳过已处理的对象，确保不重复、不遗漏。
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
    const pageToken = url.searchParams.get('pageToken') || '';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1), 100);

    const prefix = game ? `${game}/` : undefined;

    // ---- 解码分页令牌 ----
    // 令牌格式: base64(JSON({ c: R2游标|null, s: 已处理对象数 }))
    let batchCursor = undefined;  // 用于获取当前批次的 R2 cursor
    let skipCount = 0;            // 当前批次中需要跳过的对象数
    if (pageToken) {
      try {
        const decoded = JSON.parse(atob(pageToken));
        batchCursor = decoded.c || undefined;
        skipCount = decoded.s || 0;
      } catch (e) {
        // 无效令牌，从头开始
      }
    }

    // ---- 收集图片 ----
    const images = [];
    let processedInBatch = 0;  // 当前批次已处理的对象数
    let exhausted = false;     // 是否已遍历完所有 R2 数据

    while (images.length < limit) {
      const listOpts = { prefix, limit: 200 };
      if (batchCursor) {
        listOpts.cursor = batchCursor;
      }

      const listed = await bucket.list(listOpts);

      processedInBatch = 0;
      for (const obj of listed.objects) {
        processedInBatch++;

        // 跳过上次已返回的对象（从中断处继续）
        if (skipCount > 0) {
          skipCount--;
          continue;
        }

        if (isImageFile(obj.key)) {
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

      // 已收集够图片 — batchCursor 仍指向当前批次，processedInBatch 记录位置
      if (images.length >= limit) break;

      // R2 没有更多数据了
      if (!listed.truncated) {
        exhausted = true;
        break;
      }

      // 移动到下一批次
      batchCursor = listed.cursor;
      skipCount = 0;
    }

    // ---- 构造下一页令牌 ----
    const hasMore = !exhausted && images.length >= limit;
    let nextPageToken = null;
    if (hasMore) {
      // 记录当前批次的游标和已处理对象数，下次请求重新获取同一批次并跳过
      nextPageToken = btoa(JSON.stringify({
        c: batchCursor || null,
        s: processedInBatch,
      }));
    }

    return new Response(JSON.stringify({
      images,
      pageToken: nextPageToken,
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
