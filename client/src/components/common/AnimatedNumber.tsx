import { useEffect } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'

interface Props {
  value: number
  format?: (value: number) => string
  className?: string
}

const defaultFormat = (v: number) => Math.round(v).toLocaleString('en-US')

/** A number that rolls towards its new value instead of jumping. */
export function AnimatedNumber({ value, format = defaultFormat, className }: Props) {
  const reduced = useReducedMotion()
  const spring = useSpring(value, { stiffness: 140, damping: 24, mass: 0.6 })
  const text = useTransform(spring, (v) => format(v))

  useEffect(() => {
    if (reduced) spring.jump(value)
    else spring.set(value)
  }, [value, reduced, spring])

  return <motion.span className={className}>{text}</motion.span>
}
