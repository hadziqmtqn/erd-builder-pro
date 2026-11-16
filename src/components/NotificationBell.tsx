import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommentAvatar, shortCommentTime } from "@/components/comments/CommentThreadView";
import { useNotifications } from "@/hooks/useNotifications";
import { describeNotification, groupNotifications, notificationTarget, type NotificationItem, type NotificationScope } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type Props = {
  /** COL-009: a sidebar item from 768px up, the header icon while the sidebar is a Sheet. */
  placement: "header" | "sidebar";
  activeTeamId: string | null;
  /** Switches the active workspace (saving open changes first) before a link from another workspace opens. */
  onSelectWorkspace: (teamId: string | null) => Promise<void>;
};

/**
 * NOT-001.2 bell on every page: unread badge and the user's notifications from every workspace. AppLayout renders one per
 * slot; only the slot that matches the sidebar mode mounts it, so the list is fetched once (COL-009).
 */
export function NotificationBell(props: Props) {
  const { isMobile } = useSidebar();
  return (props.placement === "header") === isMobile ? <NotificationPopover {...props} /> : null;
}

function NotificationPopover({ placement, activeTeamId, onSelectWorkspace }: Props) {
  const navigate = useNavigate();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<NotificationScope>("all");
  const { items, unreadCount, status, refresh, markRead, markAllRead } = useNotifications(true);
  const groups = useMemo(() => groupNotifications(items, scope, activeTeamId), [items, scope, activeTeamId]);

  const openItem = async (item: NotificationItem) => {
    const target = notificationTarget(item, activeTeamId);
    void markRead(item.id);
    if (!target) return;
    setOpen(false);
    if (target.switchTo !== undefined) await onSelectWorkspace(target.switchTo);
    navigate(target.link);
  };

  const label = `Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`;
  const count = unreadCount > 99 ? "99+" : unreadCount;
  const sidebar = placement === "sidebar";
  const popover = (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void refresh(); }}>
      <PopoverTrigger
        render={sidebar ? (
          // No `tooltip`: its Tooltip wrapper swallows the first click on a popover trigger; `title` keeps the hint in the rail.
          <SidebarMenuButton title="Notifications" aria-label={label}>
            <span className="relative flex shrink-0">
              <Bell aria-hidden="true" />
              {/* The rail hides SidebarMenuBadge, so a small count on the icon (up to 9+) marks unread there. It stays inside the 32px button. */}
              {unreadCount > 0 && (
                <Badge aria-hidden="true" data-rail-count="" variant="default" className="absolute -right-1.5 -top-1.5 hidden h-4 min-w-4 px-0.5 text-[10px] leading-none ring-2 ring-sidebar group-data-[collapsible=icon]:inline-flex">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </span>
            <span>Notifications</span>
          </SidebarMenuButton>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={label}
            title="Notifications"
          >
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <Badge variant="default" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none">
                {count}
              </Badge>
            )}
          </Button>
        )}
      />
      <PopoverContent
        side={sidebar ? "right" : "bottom"}
        align={sidebar ? "start" : "end"}
        sideOffset={8}
        aria-describedby={descriptionId}
        className="flex max-h-[min(36rem,calc(100svh-5rem))] w-[min(24rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p id={descriptionId} className="text-xs text-muted-foreground">
              {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={!unreadCount} onClick={() => void markAllRead()}>
            Mark all as read
          </Button>
        </div>
        <div className="shrink-0 border-b border-border/70 px-3 py-2">
          <Tabs value={scope} onValueChange={(value) => setScope(value as NotificationScope)} className="w-full">
            <TabsList className="mx-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="workspace">This workspace</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {status === "loading" && !items.length ? (
            <p role="status" className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Loading notifications…
            </p>
          ) : status === "error" ? (
            <div role="alert" className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
              Couldn't load notifications.
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>
            </div>
          ) : !groups.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {scope === "workspace" ? "No notifications in this workspace." : "No notifications yet."}
            </p>
          ) : (
            <ul className="pb-1">
              {groups.map((group) => (
                <li key={group.key}>
                  <h3 className="sticky top-0 z-10 bg-popover px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  {group.projects.map((project) => (
                    <section key={project.key} aria-label={project.label ?? group.label}>
                      {project.label && <p className="truncate px-3 pt-1 text-[11px] font-medium text-muted-foreground">{project.label}</p>}
                      <ul>
                        {project.items.map((item) => (
                          <li key={item.id}>
                            <NotificationRow item={item} clickable={Boolean(notificationTarget(item, activeTeamId))} onOpen={openItem} onMarkRead={markRead} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
  if (!sidebar) return popover;
  return (
    <SidebarMenuItem>
      {popover}
      {unreadCount > 0 && (
        <SidebarMenuBadge aria-hidden="true" className="rounded-full bg-primary text-[10px] text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground">
          {count}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

function NotificationRow({ item, clickable, onOpen, onMarkRead }: {
  item: NotificationItem;
  clickable: boolean;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (id: string) => void;
}) {
  const { title, detail } = describeNotification(item);
  const unread = !item.readAt;
  const body = (
    <>
      <CommentAvatar name={item.actorName ?? item.teamName ?? "?"} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", unread ? "font-semibold text-foreground" : "text-foreground/80")}>{title}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
        {unread && <span className="sr-only">Unread</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <time dateTime={item.createdAt} className="text-[11px] text-muted-foreground">{shortCommentTime(item.createdAt)}</time>
        {unread && <span aria-hidden="true" className="size-2 rounded-full bg-primary" />}
      </span>
    </>
  );
  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn("flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", unread && "bg-primary/5")}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cn("flex w-full items-start gap-3 px-3 py-2", unread && "bg-primary/5")}>
      {body}
      {unread && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Mark as read" onClick={() => onMarkRead(item.id)}>
          <Check aria-hidden="true" className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
