"use client"

import {
  Button,
  ButtonGroup,
  Badge,
  Chip,
  Avatar,
  Card,
  Alert,
  Spinner,
  Separator,
} from "@heroui/react"

export function HeroUIDemo() {
  return (
    <div className="flex flex-col gap-8 p-8">

      {/* Buttons */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Buttons</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-soft">Danger Soft</Button>
          <Button variant="tertiary">Tertiary</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="primary">Small</Button>
          <Button size="md" variant="primary">Medium</Button>
          <Button size="lg" variant="primary">Large</Button>
          <Button variant="outline" isDisabled>Disabled</Button>
        </div>
        <ButtonGroup>
          <Button variant="outline">Left</Button>
          <Button variant="outline">Center</Button>
          <Button variant="outline">Right</Button>
        </ButtonGroup>
      </section>

      <Separator />

      {/* Chips */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Chips</h3>
        <div className="flex flex-wrap gap-3">
          <Chip>Default</Chip>
          <Chip color="danger">Danger</Chip>
          <Chip color="success">Success</Chip>
          <Chip color="warning">Warning</Chip>
          <Chip color="accent">Accent</Chip>
        </div>
        <div className="flex flex-wrap gap-3">
          <Chip variant="primary" color="danger">Primary</Chip>
          <Chip variant="secondary" color="danger">Secondary</Chip>
          <Chip variant="soft" color="danger">Soft</Chip>
          <Chip variant="tertiary">Tertiary</Chip>
        </div>
      </section>

      <Separator />

      {/* Avatars & Badges */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Avatars & Badges</h3>
        <div className="flex gap-6 items-center">
          <Avatar size="sm"><Avatar.Fallback>AB</Avatar.Fallback></Avatar>
          <Avatar size="md"><Avatar.Fallback>CD</Avatar.Fallback></Avatar>
          <Avatar size="lg" color="danger"><Avatar.Fallback>EF</Avatar.Fallback></Avatar>
          <Avatar size="md" color="success"><Avatar.Fallback>GH</Avatar.Fallback></Avatar>
        </div>
        <div className="flex gap-6 items-center">
          <Badge.Root color="danger">
            <Badge.Label>3</Badge.Label>
            <Badge.Anchor>
              <Avatar size="md"><Avatar.Fallback>AB</Avatar.Fallback></Avatar>
            </Badge.Anchor>
          </Badge.Root>
          <Badge.Root color="success">
            <Badge.Label>99+</Badge.Label>
            <Badge.Anchor>
              <Avatar size="md"><Avatar.Fallback>CD</Avatar.Fallback></Avatar>
            </Badge.Anchor>
          </Badge.Root>
        </div>
      </section>

      <Separator />

      {/* Cards */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Cards</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <Card.Header>
              <Card.Title>Default Card</Card.Title>
              <Card.Description>Standard surface variant.</Card.Description>
            </Card.Header>
            <Card.Content>
              <p className="text-sm text-muted-foreground">Card body content goes here.</p>
            </Card.Content>
          </Card>
          <Card variant="secondary">
            <Card.Header>
              <Card.Title>Secondary Card</Card.Title>
              <Card.Description>Secondary surface variant.</Card.Description>
            </Card.Header>
            <Card.Content>
              <p className="text-sm text-muted-foreground">Card body content goes here.</p>
            </Card.Content>
          </Card>
          <Card variant="transparent">
            <Card.Header>
              <Card.Title>Transparent Card</Card.Title>
              <Card.Description>No background variant.</Card.Description>
            </Card.Header>
            <Card.Content>
              <p className="text-sm text-muted-foreground">Card body content goes here.</p>
            </Card.Content>
          </Card>
        </div>
      </section>

      <Separator />

      {/* Alerts */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Alerts</h3>
        <Alert.Root>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Default alert</Alert.Title>
            <Alert.Description>Informational message with no specific status.</Alert.Description>
          </Alert.Content>
        </Alert.Root>
        <Alert.Root status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Danger alert</Alert.Title>
            <Alert.Description>Something went wrong. Please try again.</Alert.Description>
          </Alert.Content>
        </Alert.Root>
        <Alert.Root status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Success</Alert.Title>
            <Alert.Description>Your changes were saved successfully.</Alert.Description>
          </Alert.Content>
        </Alert.Root>
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Warning</Alert.Title>
            <Alert.Description>Please review your inputs before continuing.</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      </section>

      <Separator />

      {/* Spinners */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Spinners</h3>
        <div className="flex gap-6 items-center">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <Spinner size="xl" />
          <Spinner color="danger" />
          <Spinner color="success" />
          <Spinner color="warning" />
          <Spinner color="accent" />
        </div>
      </section>

    </div>
  )
}
