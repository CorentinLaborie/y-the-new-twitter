/** Docs-only prop types for window.YDS components. */
import type { ReactNode, CSSProperties } from 'react';
type Common = { className?: string };
export type IconName = 'home'|'home-filled'|'search'|'bell'|'mail'|'bookmark'|'bookmark-filled'|'user'|'circle-ellipsis'|'ellipsis'|'image'|'gif'|'poll'|'smile'|'calendar-clock'|'map-pin'|'globe'|'thumbs-up'|'thumbs-down'|'user-plus'|'triangle-alert'|'plus'|'shield'|'eye-off'|'flag'|'log-in'|'arrow-left'|'calendar'|'message-circle'|'repeat'|'heart'|'chart'|'share'|'badge-check'|'x'|'menu'|'link'|'user-minus'|'settings'|'log-out'|'circle-help'|'moon'|'lock'|'chevron-right'|'chevron-down'|'send'|'mail-plus'|'hash'|'trending-up'|'info'|'trash-2'|'check'|'at-sign'|'eye';
export interface IconProps extends Common { name: IconName; size?: number; strokeWidth?: number; color?: string; label?: string }
export interface YLogoProps extends Common { size?: number; tone?: 'primary'|'ink'|'white'; tile?: boolean }
export interface ButtonProps extends Common { variant?: 'primary'|'outline'|'secondary'|'ghost'; size?: 'sm'|'md'|'lg'; shape?: 'rounded'|'pill'; icon?: IconName; iconRight?: IconName|'y'; block?: boolean; type?: 'button'|'submit'|'reset'; disabled?: boolean; onClick?: (e: any) => void; children?: ReactNode }
export interface IconButtonProps extends Common { icon: IconName; tone?: 'primary'|'muted'|'ink'; label?: string; iconSize?: number; hover?: boolean; onClick?: (e: any) => void }
export interface AvatarProps extends Common { name?: string; initial?: string; src?: string; size?: number }
export interface NavItemProps extends Common { icon: IconName; label: string; active?: boolean; hover?: boolean; badge?: number|string; href?: string }
export interface TabProps extends Common { label: string; active?: boolean; hover?: boolean; onClick?: () => void }
export interface TextFieldProps extends Common { label?: string; hint?: string; placeholder?: string; value?: string; type?: string; icon?: IconName; error?: string; errors?: string[]; multiline?: boolean; rows?: number; muted?: boolean; align?: 'start'|'center' }
export interface CheckboxProps extends Common { label: ReactNode; checked?: boolean }
export interface FollowButtonProps extends Common { followed?: boolean; iconOnly?: boolean }
export interface ReactionPillProps extends Common { kind?: 'like'|'dislike'|'y'; count: number|string; active?: boolean; block?: boolean }
export interface SaveButtonProps extends Common { saved?: boolean; block?: boolean; onToggle?: (saved: boolean) => void }
export interface QuestionPostProps extends Common { author: string; date: string; body: string; tags?: string[]; reactions?: { like?: number; dislike?: number; y?: number }; followed?: boolean; hideFollow?: boolean; yActive?: boolean; bookmarkable?: boolean; saved?: boolean; compact?: boolean; stacked?: boolean; children?: ReactNode }
export interface CardProps extends Common { raised?: boolean; tone?: 'muted'; style?: CSSProperties; children?: ReactNode }
export interface MenuProps extends Common { items: { icon?: IconName; label: string; tone?: 'danger' }[]; label?: string }
export interface ConversationBoxProps extends Common { replyTo: string; moreLabel?: string; size?: 'sm'; children?: ReactNode }
export interface SearchFieldProps extends Common { label: string; placeholder?: string; showLabel?: boolean; value?: string; size?: 'md'|'sm'; id?: string }
export interface PageHeaderProps extends Common { title: string; subtitle?: string; back?: boolean; backLabel?: string; bordered?: boolean; children?: ReactNode }
export interface MobileTopBarProps extends Common { title?: string; subtitle?: string; titleHref?: string; titleLabel?: string; back?: boolean; user?: string; unread?: boolean; children?: ReactNode }
export interface SelectProps extends Common { label?: string; options: (string|{value:string;label:string})[]; value?: string; inline?: boolean; id?: string }
export interface DialogProps extends Common { title: string; text?: string; confirmLabel?: string; cancelLabel?: string; tone?: 'danger'; children?: ReactNode }
export interface ToastProps extends Common { message: string; action?: string }
export interface RailItemProps extends Common { icon: IconName; label: string; active?: boolean; badge?: number|string; href?: string }
export interface RailPosterProps extends Common { label?: string }
export interface FooterProps extends Common { variant?: 'sidebar'|'page'; links?: boolean }
export interface EmptyStateProps extends Common { icon?: IconName; title: string; text?: string; children?: ReactNode }
export interface YProgressProps extends Common { count: number; threshold?: number; bar?: boolean }
export interface CharCounterProps extends Common { value: number; max: number }
export interface SkeletonProps extends Common { variant?: 'line'|'avatar'|'card'; width?: number|string }
export interface ErrorStateProps extends Common { title: string; message?: string; retryLabel?: string; onRetry?: (e: any) => void }
export interface LoadMoreProps extends Common { label?: string; loading?: boolean; onClick?: (e: any) => void }
// QuestionPost also: hideMenu?, menuOpen?, mine?   FollowButton: label?, followedLabel?, size?: 'md'   TextField: revealable?, id?   Button variant: 'destructive'|'danger'
