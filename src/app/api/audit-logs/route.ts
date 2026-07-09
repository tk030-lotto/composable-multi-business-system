import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    // ページ番号と取得件数（デフォルトはページ1、100件上限とする）
    const page = Math.max(1, parseInt(pageParam || '1', 10));
    // サーバーの過負荷を防ぐため、1回のリクエストでの最大取得件数は100件に制限
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '100', 10)));

    const skip = (page - 1) * limit;

    // Promise.allを使用して、総件数の取得とデータの取得を並列実行
    const [total, logs] = await Promise.all([
      prisma.audit_logs.count(),
      prisma.audit_logs.findMany({
        skip,
        take: limit,
        orderBy: {
          changed_at: 'desc',
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // 統一エラーハンドリング体系（成功時フォーマット）に準拠して返却
    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Audit logs API error:', error);
    // エラー時の統一フォーマット
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: '監査ログの取得中にエラーが発生しました。',
      },
      { status: 500 }
    );
  }
}
