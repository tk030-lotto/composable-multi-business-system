import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';

// 開発環境におけるPrismaClientのインスタンスの再利用設定（HMR対策）
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const query = (text: string, params?: unknown[]) => pool.query(text, params);
export const getClient = () => pool.connect();

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * データベーストランザクションを実行し、自動的に操作者のセッション変数を設定するラッパー関数。
 * 自動監査ログのトリガー関数 `log_all_changes()` と連携して操作者を記録します。
 *
 * @param operatorId 操作を実行するユーザーのID (デフォルトは 'SYSTEM')
 * @param callback トランザクション内で実行する処理（Prismaのトランザクションクライアントを受け取る）
 */
export async function withTransaction<T>(
  operatorId: string = 'SYSTEM',
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // 1. PostgreSQLのセッション変数に操作ユーザーIDを設定
    // set_config(..., true) により、この設定は現在のトランザクション内でのみ有効
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${operatorId}, true)`;

    // 2. コールバック処理を実行（ここで渡されたtxを用いてINSERT/UPDATE/DELETE等を行う）
    const result = await callback(tx);

    return result;
  });
}
