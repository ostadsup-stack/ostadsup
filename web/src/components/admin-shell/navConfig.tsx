import type { ComponentType } from 'react'
import {
  IconBook,
  IconGraduation,
  IconLayout,
  IconMail,
  IconPosts,
  IconSettings,
  IconUsers,
} from '../NavIcons'

export type AdminShellNavItem = {
  to: string
  end?: boolean
  label: string
  Icon: ComponentType<{ className?: string }>
  activeMatch?: (path: string) => boolean
}

export const ADMIN_SHELL_NAV: AdminShellNavItem[] = [
  {
    to: '/admin/dashboard',
    end: true,
    label: 'لوحة التحكم',
    Icon: IconLayout,
    activeMatch: (path) =>
      path === '/admin' ||
      path === '/admin/dashboard' ||
      path.startsWith('/admin/universities/'),
  },
  { to: '/admin/teachers', label: 'الأساتذة', Icon: IconUsers },
  { to: '/admin/groups', label: 'الأفواج', Icon: IconBook },
  { to: '/admin/students', label: 'الطلبة', Icon: IconGraduation },
  {
    to: '/admin/invitations',
    label: 'الدعوات',
    Icon: IconMail,
    activeMatch: (path) => path.startsWith('/admin/invitations'),
  },
  {
    to: '/admin/content',
    label: 'المحتوى',
    Icon: IconPosts,
    activeMatch: (path) =>
      path === '/admin/content' ||
      path.startsWith('/admin/posts') ||
      path.startsWith('/admin/messages') ||
      path.startsWith('/admin/campus-wall'),
  },
  { to: '/admin/settings', label: 'الإعدادات', Icon: IconSettings },
]
