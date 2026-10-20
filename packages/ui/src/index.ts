// @forgeops/ui: the only place visual components are defined. Apps compose these;
// they never restyle raw HTML or import the underlying libraries directly (lint-enforced).
export { cn } from './lib/cn';

export { Alert, type AlertProps } from './primitives/alert';
export { Badge, type BadgeProps, badgeVariants, type Tone } from './primitives/badge';
export { Button, type ButtonProps, buttonVariants } from './primitives/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './primitives/card';
export { Input, Textarea } from './primitives/input';
export { Label } from './primitives/label';
export { Skeleton } from './primitives/skeleton';
export { Spinner } from './primitives/spinner';

export { Field, type FieldControlProps, type FieldProps } from './patterns/field';
export { NavItem, PageHeader, Shell } from './patterns/layout';
export { EmptyState, ErrorState } from './patterns/states';
