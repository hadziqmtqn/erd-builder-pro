import { ChevronRight, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    iconClassName?: string
    badge?: string
    items?: {
      title: string
      url: string
    }[]
    onClick?: () => void
  }[]
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          {item.items ? (
            <Collapsible
              defaultOpen={item.isActive}
              className="group/collapsible"
            >
              <CollapsibleTrigger
                render={
                  <SidebarMenuButton tooltip={item.title} className="cursor-pointer">
                    {item.icon && <item.icon className={item.iconClassName} />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                }
              />
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items?.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton render={<a href={subItem.url} />} className="cursor-pointer">
                        <span>{subItem.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <SidebarMenuButton
              tooltip={item.title}
              isActive={item.isActive}
              onClick={item.onClick}
              className="cursor-pointer"
            >
              {item.icon && <item.icon className={item.iconClassName} />}
              <span>{item.title}</span>
              {item.badge && (
                <span
                  aria-label={`${item.title} is a Pro feature`}
                  className="ml-auto shrink-0 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary group-data-[collapsible=icon]:hidden"
                >
                  {item.badge}
                </span>
              )}
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
