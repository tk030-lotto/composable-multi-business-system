import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 環境変数により同意チェック自体をバイパス可能にする（開発時用）
  const requireAgreement = process.env.NEXT_PUBLIC_REQUIRE_LICENSE_AGREEMENT !== 'false';
  if (!requireAgreement) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 1. 除外パス（ログイン画面、静的ファイル、各種アセット）の判定
  if (
    pathname === '/login' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next') ||
    pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // 2. クッキーの存在・有効性検証（バージョンを環境変数から取得）
  const version = process.env.NEXT_PUBLIC_LICENSE_AGREEMENT_VERSION || '1.0.0';
  const cookieName = `crm_license_accepted_v${version}`;
  const acceptedCookie = request.cookies.get(cookieName);
  const isAccepted = acceptedCookie?.value === 'true';

  if (!isAccepted) {
    // APIリクエストの場合は JSON で 403 エラーを返し、バックエンド側でも二重ロックする
    if (pathname.startsWith('/api')) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: '免責条項への同意が必要です。システム画面から同意してください。',
          code: 'LICENSE_AGREEMENT_REQUIRED',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 通常の画面アクセスの場合は免責ゲート（/login）へ強制リダイレクト
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // すべてのリクエストに対して実行 (除外ロジックは内部で判定)
  matcher: '/:path*',
};
