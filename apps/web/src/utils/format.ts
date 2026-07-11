const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

export const parseLocalDate = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-").map(Number);
    const [year, month, day] = parts;
    const local = new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDisplayDate = (value?: string | Date | null) => {
  const date = parseLocalDate(value);
  return date ? dateFormatter.format(date) : "--";
};

export const formatDisplayTime = (value?: string | Date | null) => {
  if (!value) return "--";
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    date = new Date();
    date.setHours(hour || 0, minute || 0, 0, 0);
  } else {
    date = new Date(value);
  }
  return date && !Number.isNaN(date.getTime()) ? timeFormatter.format(date).toLowerCase() : "--";
};

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remaining}s`;
  if (minutes > 0) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
};
