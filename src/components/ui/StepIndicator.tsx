interface StepIndicatorProps {
  current: 1 | 2 | 3
}

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <div className="step-track" aria-label={`Step ${current} of 3`}>
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`step-node ${step < current ? 'done' : step === current ? 'active' : ''}`}
          >{step < current ? '✓' : step}</div>
        ))}
    </div>
  )
}
