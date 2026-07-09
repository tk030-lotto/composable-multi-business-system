'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  const handleAgree = () => {
    if (!agreed) return;

    // Cookieのセット
    const version = process.env.NEXT_PUBLIC_LICENSE_AGREEMENT_VERSION || '1.0.0';
    const cookieName = `crm_license_accepted_v${version}`;
    // expires: 365 days
    const date = new Date();
    date.setTime(date.getTime() + 365 * 24 * 60 * 60 * 1000);
    document.cookie = `${cookieName}=true; expires=${date.toUTCString()}; path=/; SameSite=Lax`;

    // トップページへリダイレクト
    router.push('/');
    router.refresh(); // 強制リフレッシュでミドルウェアのステートを更新
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconContainer}>
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 className={styles.title}>システム利用承諾</h1>

        <p className={styles.description}>
          本システムを安全にご利用いただくため、以下のソフトウェア利用に関する承諾書をご確認ください。
        </p>

        <div className={styles.agreementBox}>
          <h2 className={styles.agreementTitle}>【ソフトウェア利用に関する承諾書】</h2>
          <p>
            本ソフトウェア（以下「本システム」という）は、個人の練習・ホビーの一環として無償（または実費）で提供される試作品です。
          </p>
          <ul>
            <li>
              <strong>（無保証）</strong>{' '}
              利用者は、本システムに不具合やバグが存在する可能性があることを理解し、現状有姿で利用するものとします。
            </li>
            <li>
              <strong>（免責）</strong>{' '}
              制作者は、本システムの利用、または利用不能によって生じた損害（データの消失、業務の中断、営業利益の損失などを含むがこれらに限定されない）について、一切の法的責任および賠償責任を負わないものとします。
            </li>
            <li>
              <strong>（ライセンス）</strong> 本システムは、MITライセンスに基づいて提供されます。
            </li>
          </ul>
        </div>

        <details className={styles.licenseDetails}>
          <summary>MITライセンス全文を表示する</summary>
          <div className={styles.licenseContent}>
            <p>Copyright (c) 2026 BaseKit Project Authors</p>
            <p>
              Permission is hereby granted, free of charge, to any person obtaining a copy of this
              software and associated documentation files (the &quot;Software&quot;), to deal in the
              Software without restriction, including without limitation the rights to use, copy,
              modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
              and to permit persons to whom the Software is furnished to do so, subject to the
              following conditions:
            </p>
            <p>
              The above copyright notice and this permission notice shall be included in all copies
              or substantial portions of the Software.
            </p>
            <p>
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
              HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
              CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
              OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
            </p>
          </div>
        </details>

        <div className={styles.checkboxContainer}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className={styles.checkbox}
            />
            <span>すべての免責事項およびライセンス条項に同意します</span>
          </label>
        </div>

        <button onClick={handleAgree} disabled={!agreed} className={styles.button}>
          同意してシステムを利用する
        </button>
      </div>
    </div>
  );
}
