/** Keyframes used by the exam runner and results (scoped names; reduced motion handled globally). */
export function ExamStyles() {
  return (
    <style>{`
@keyframes exam-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)} }
@keyframes exam-pop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.12);opacity:1} 100%{transform:scale(1)} }
@keyframes exam-rise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
@keyframes exam-slide { from{opacity:0;transform:translateX(18px)} to{opacity:1;transform:none} }
@keyframes exam-heart { 0%{transform:scale(1)} 30%{transform:scale(1.35)} 100%{transform:scale(1)} }
.exam-shake{animation:exam-shake 320ms ease-out}
.exam-pop{animation:exam-pop 360ms cubic-bezier(.22,1,.36,1) both}
.exam-rise{animation:exam-rise 380ms cubic-bezier(.22,1,.36,1) both}
.exam-slide{animation:exam-slide 240ms cubic-bezier(.22,1,.36,1) both}
.exam-heart{animation:exam-heart 420ms ease-out}
`}</style>
  );
}
