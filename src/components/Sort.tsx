import { Link } from '@tanstack/react-router'
import { ORDERS, type Order } from '../domain/pagination.ts'
import styles from './Sort.module.css'

type Props = {
  current: Order
  defaultOrder: Order
  // Search params to clear when the order changes, such as cursors
  reset: Record<string, undefined>
}

export const Sort = ({ current, defaultOrder, reset }: Props) => (
  <div className={styles.sort}>
    {ORDERS.map((o) => (
      <Link
        key={o.value}
        to="."
        search={(prev: object) => ({
          ...prev,
          ...reset,
          order: o.value === defaultOrder ? undefined : o.value,
        })}
        className={`link ${o.value === current ? 'current' : ''}`}
        replace
      >
        {o.label}
      </Link>
    ))}
  </div>
)
