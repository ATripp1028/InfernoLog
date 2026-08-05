// Shared Radix Dialog animation recipe: slide up from the bottom on mobile
// (matching the app's other drawers), centered zoom/fade on desktop. Each
// dialog composes these with its own z-index, sizing, blur, and background —
// only the animation classes themselves are shared, so drift there (a fix in
// one dialog getting missed in a sibling) can't happen silently.
export const dialogOverlayAnimation =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

export const dialogContentAnimation = [
  'data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-200 data-[state=open]:duration-300',
  'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
  'md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95 md:data-[state=closed]:fade-out-0 md:data-[state=open]:fade-in-0',
].join(' ')
