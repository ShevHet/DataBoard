/**
 * Утилиты для shallow сравнения массивов и объектов
 * Для предотвращения ненужных обновлений state
 */

/**
 * Сравнение двух массивов чисел (shallow)
 */
export const arraysEqual = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

/**
 * Сравнение двух объектов selection (shallow)
 */
export const selectionEqual = (a, b) => {
  if (!a || !b) return a === b;
  return (
    arraysEqual(a.selectedIds, b.selectedIds) &&
    arraysEqual(a.order, b.order)
  );
};

/**
 * Сравнение двух массивов объектов items (shallow по ID и createdAt)
 */
export const itemsEqual = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].createdAt !== b[i].createdAt) {
      return false;
    }
  }
  return true;
};

/**
 * Сравнение двух Set (по содержимому)
 */
export const setsEqual = (a, b) => {
  if (!(a instanceof Set) || !(b instanceof Set)) {
    return false;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
};

