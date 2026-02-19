import { AppShell, Group, NavLink, Title, useMantineColorScheme, ActionIcon } from "@mantine/core";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  IconDashboard,
  IconHistory,
  IconSettings,
  IconSun,
  IconMoon,
} from "@tabler/icons-react";

const navItems = [
  { label: "Dashboard", icon: IconDashboard, path: "/" },
  { label: "History", icon: IconHistory, path: "/history" },
  { label: "Settings", icon: IconSettings, path: "/settings" },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <AppShell navbar={{ width: 220, breakpoint: "sm" }} padding="md">
      <AppShell.Navbar p="sm">
        <Group justify="space-between" mb="md">
          <Title order={4}>scdl-web</Title>
          <ActionIcon variant="subtle" onClick={toggleColorScheme} size="lg">
            {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Group>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            label={item.label}
            leftSection={<item.icon size={18} />}
            active={
              item.path === "/"
                ? location.pathname === "/" || location.pathname.startsWith("/sources")
                : location.pathname.startsWith(item.path)
            }
            onClick={() => navigate(item.path)}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
