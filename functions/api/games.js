/**
 * GET /api/games
 * 列出 R2 Bucket 中所有游戏分类（顶级文件夹）
 */

export async function onRequestGet(context) {
  try {
    const bucket = context.env.R2_BUCKET;

    // 使用 delimiter 获取顶级"文件夹"（即游戏分类）
    const listed = await bucket.list({ delimiter: '/' });
    const prefixes = listed.delimitedPrefixes || [];

    const games = prefixes
      .map(prefix => ({
        name: prefix.replace(/\/$/, ''),
        prefix: prefix,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    return new Response(JSON.stringify({ games }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to list games', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
