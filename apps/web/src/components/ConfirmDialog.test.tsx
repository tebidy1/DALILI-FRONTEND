import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

describe('ConfirmDialog — حوار تأكيد داخل الصفحة', () => {
  it('لا يظهر إن open=false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="ح"
        body="ب"
        confirmLabel="نعم"
        cancelLabel="لا"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('«تأكيد» يستدعي onConfirm و«إلغاء» يستدعي onCancel', () => {
    const oc = vi.fn()
    const oca = vi.fn()
    render(
      <ConfirmDialog
        open
        title="ح"
        body="ب"
        confirmLabel="نعم"
        cancelLabel="لا"
        onConfirm={oc}
        onCancel={oca}
      />,
    )
    fireEvent.click(screen.getByText('نعم'))
    expect(oc).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('لا'))
    expect(oca).toHaveBeenCalledTimes(1)
  })

  it('busy يعطّل زرَّي التأكيد والإلغاء', () => {
    render(
      <ConfirmDialog
        open
        busy
        title="ح"
        body="ب"
        confirmLabel="نعم"
        cancelLabel="لا"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect((screen.getByText('نعم') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('لا') as HTMLButtonElement).disabled).toBe(true)
  })

  it('errorAr يظهر داخل الحوار', () => {
    render(
      <ConfirmDialog
        open
        title="ح"
        body="ب"
        confirmLabel="نعم"
        cancelLabel="لا"
        errorAr="تعذّر"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('تعذّر')).toBeTruthy()
  })
})
