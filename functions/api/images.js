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
    const sort = url.searchParams.get('sort') || 'newest'; // 'newest' or 'oldest'

    const prefix = game ? `${game}/` : undefined;

    // 排序模式：需要获取全部图片后全局排序，再偏移分页
    if (sort === 'newest' || sort === 'oldest') {
      return await handleSortedRequest(bucket, prefix, sort, limit, pageToken);
    }

    // 默认模式：R2 key 字典序，游标分页（高效）
    return await handleDefaultRequest(bucket, prefix, limit, pageToken);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to list images', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * 排序模式：获取全部图片 → 按上传时间全局排序 → 偏移分页
 */
async function handleSortedRequest(bucket, prefix, sort, limit, pageToken) {
  // 解码偏移量
  let offset = 0;
  if (pageToken) {
    try {
      const decoded = JSON.parse(atob(pageToken));
      offset = decoded.o || 0;
    } catch (e) {
      // 无效令牌，从头开始
    }
  }

  // 获取全部图片元数据
  const allImages = await fetchAllImages(bucket, prefix);

  // 全局排序
  allImages.sort((a, b) => {
    const ta = a.uploadedTs;
    const tb = b.uploadedTs;
    return sort === 'oldest' ? (ta - tb) : (tb - ta);
  });

  // 偏移分页
  const pageImages = allImages.slice(offset, offset + limit);
  const hasMore = offset + limit < allImages.length;

  let nextPageToken = null;
  if (hasMore) {
    nextPageToken = btoa(JSON.stringify({ o: offset + limit }));
  }

  // 移除内部排序字段
  const images = pageImages.map(({ uploadedTs, ...rest }) => rest);

  return new Response(JSON.stringify({
    images,
    pageToken: nextPageToken,
    hasMore,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

/**
 * 获取 R2 中全部图片元数据
 */
async function fetchAllImages(bucket, prefix) {
  const allImages = [];
  let cursor = undefined;

  while (true) {
    const listOpts = { prefix, limit: 1000 };
    if (cursor) listOpts.cursor = cursor;

    const listed = await bucket.list(listOpts);

    for (const obj of listed.objects) {
      if (isImageFile(obj.key)) {
        const slashIndex = obj.key.indexOf('/');
        const gameName = slashIndex !== -1 ? obj.key.slice(0, slashIndex) : '';
        const fileName = slashIndex !== -1 ? obj.key.slice(slashIndex + 1) : obj.key;

        allImages.push({
          key: obj.key,
          game: gameName,
          name: fileName,
          size: obj.size,
          sizeFormatted: formatSize(obj.size),
          uploaded: obj.uploaded?.toISOString() || null,
          uploadedTs: obj.uploaded ? obj.uploaded.getTime() : 0,
        });
      }
    }

    if (!listed.truncated) break;
    cursor = listed.cursor;
  }

  return allImages;
}

/**
 * 默认模式：R2 key 字典序，复合游标分页
 */
async function handleDefaultRequest(bucket, prefix, limit, pageToken) {
  let batchCursor = undefined;
  let skipCount = 0;
  if (pageToken) {
    try {
      const decoded = JSON.parse(atob(pageToken));
      batchCursor = decoded.c || undefined;
      skipCount = decoded.s || 0;
    } catch (e) {
      // 无效令牌，从头开始
    }
  }

  const images = [];
  let processedInBatch = 0;
  let exhausted = false;

  while (images.length < limit) {
    const listOpts = { prefix, limit: 200 };
    if (batchCursor) listOpts.cursor = batchCursor;

    const listed = await bucket.list(listOpts);

    processedInBatch = 0;
    for (const obj of listed.objects) {
      processedInBatch++;

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

    if (images.length >= limit) break;

    if (!listed.truncated) {
      exhausted = true;
      break;
    }

    batchCursor = listed.cursor;
    skipCount = 0;
  }

  const hasMore = !exhausted && images.length >= limit;
  let nextPageToken = null;
  if (hasMore) {
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
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
