'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const licenseVersion = process.env.NEXT_PUBLIC_LICENSE_AGREEMENT_VERSION || '1.0.0';

  // ログイン画面では共通フッターを表示しない
  if (pathname === '/login') {
    return null;
  }

  return (
    <>
      <footer className="app-footer">
        <div className="footer-content">
          <span>© 2026 my-crm-basekit</span>
          <span className="divider">|</span>
          <button 
            type="button" 
            className="license-link-btn" 
            onClick={() => setIsOpen(true)}
            title="ライセンスおよび免責条項を表示"
          >
            MITライセンス &amp; 免責事項 (v{licenseVersion}) 同意済み
          </button>
        </div>
      </footer>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>合意済みの使用許諾 ＆ 免責条項</h2>
              <button 
                type="button" 
                className="close-btn" 
                onClick={() => setIsOpen(false)}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <h3>1. ソフトウェア利用に関する承諾書</h3>
              <p>
                本ソフトウェア（以下「本システム」という）は、知人としての個人の練習・ホビーの一環として無償（または実費）で提供される試作品です。
              </p>
              <p><strong>（無保証）</strong></p>
              <p>
                利用者は、本システムに不具合やバグが存在する可能性があることを理解し、現状有姿で利用するものとします。
              </p>
              <p><strong>（免責）</strong></p>
              <p>
                制作者は、本システムの利用、または利用不能によって生じた損害（データの消失、業務の中断、営業利益の損失などを含むがこれらに限定されない）について、一切の法的責任および賠償責任を負わないものとします。
              </p>
              <p><strong>（ライセンス）</strong></p>
              <p>
                本システムの著作権は制作者に帰属し、MITライセンスに基づいて提供されます。
              </p>

              <h3>2. MIT License</h3>
              <pre>{`The MIT License (MIT)

Copyright (c) 2026 my-crm-basekit

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`}</pre>
            </div>
            
            <div className="modal-footer">
              <button 
                type="button" 
                className="modal-close-action" 
                onClick={() => setIsOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
