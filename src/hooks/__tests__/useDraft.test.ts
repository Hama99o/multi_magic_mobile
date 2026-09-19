/**
 * The composer's draft — the hook that decides whether somebody's half-typed
 * question survives.
 *
 * It had no test file at all until now, which is why this exists ahead of any
 * refactor of it. `docs/TESTING.md` §13 is the reason it is shaped this way:
 * three of these RE-RENDER with a different conversation, because everything
 * interesting about this hook lives on the far side of a second render, and a
 * test that mounts once is testing the first render's world.
 *
 * The one the file's own comment is most worried about is
 * "does not write before it has read" — the window where an empty `draft`
 * means *not loaded yet* rather than *the user cleared it*. Writing in that
 * window erases the very thing being restored, and the symptom is a draft that
 * vanishes exactly when you come back to it, which is the failure people
 * abandon an app over.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDraft } from "../useDraft";

const KEY = (id: number) => `mm-draft:${id}`;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("restoring", () => {
  it("brings back what was stored for this conversation", async () => {
    await AsyncStorage.setItem(KEY(4), "combien je dois à la banque");

    const { result } = renderHook(() => useDraft(4));

    await waitFor(() => expect(result.current.draft).toBe("combien je dois à la banque"));
  });

  it("starts empty when there is nothing stored", async () => {
    const { result } = renderHook(() => useDraft(4));

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(4)));
    expect(result.current.draft).toBe("");
  });

  it("leaves the composer empty rather than throwing when storage cannot be read", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("storage gone"));

    const { result } = renderHook(() => useDraft(4));

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(result.current.draft).toBe("");
  });
});

describe("saving", () => {
  it("writes under the conversation's own key", async () => {
    const { result } = renderHook(() => useDraft(4));
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    act(() => result.current.setDraft("rappelle-moi"));

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY(4), "rappelle-moi"));
  });

  // ── THE RACE THE HOOK'S OWN COMMENT IS ABOUT ────────────────────────────
  //
  // Between mount and the stored draft arriving, `draft` is "" — and that ""
  // means "not read yet", not "cleared". A write in that window removes the
  // key, so coming back to a conversation you had typed into shows an empty
  // composer and the text is gone from disk too. `loaded` is the guard; this
  // is what watches it.
  it("does not erase the stored draft before it has finished reading it", async () => {
    await AsyncStorage.setItem(KEY(4), "ne me supprime pas");
    (AsyncStorage.removeItem as jest.Mock).mockClear();

    renderHook(() => useDraft(4));

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(4)));
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY(4))).toBe("ne me supprime pas");
  });

  it("removes the key rather than storing an empty string", async () => {
    const { result } = renderHook(() => useDraft(4));
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    act(() => result.current.setDraft("something"));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());

    act(() => result.current.clear());

    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledWith(KEY(4)));
  });
});

// ── EVERYTHING BELOW RE-RENDERS, BECAUSE THAT IS WHERE THE BUGS ARE ─────────
describe("switching conversation", () => {
  it("does not carry a half-typed question into the next one", async () => {
    const { result, rerender } = renderHook(({ id }: { id: number }) => useDraft(id), {
      initialProps: { id: 4 },
    });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(4)));
    act(() => result.current.setDraft("meant for four"));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY(4), "meant for four"));

    rerender({ id: 9 });

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(9)));
    expect(result.current.draft).toBe("");
  });

  it("restores the second conversation's own draft", async () => {
    await AsyncStorage.setItem(KEY(9), "belongs to nine");
    const { rerender, result } = renderHook(({ id }: { id: number }) => useDraft(id), {
      initialProps: { id: 4 },
    });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(4)));

    rerender({ id: 9 });

    await waitFor(() => expect(result.current.draft).toBe("belongs to nine"));
  });

  // The write guard has to RESET on the switch as well as on mount. If it
  // stayed true from the previous conversation, the clear-then-load of the new
  // one would write "" over the new conversation's stored draft before it had
  // been read — the same erasure as above, arriving through the door that only
  // opens on a second render.
  it("does not erase the NEXT conversation's draft while loading it", async () => {
    await AsyncStorage.setItem(KEY(9), "nine's own words");
    const { result, rerender } = renderHook(({ id }: { id: number }) => useDraft(id), {
      initialProps: { id: 4 },
    });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(4)));
    act(() => result.current.setDraft("four's words"));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY(4), "four's words"));

    rerender({ id: 9 });
    await waitFor(() => expect(result.current.draft).toBe("nine's own words"));

    expect(await AsyncStorage.getItem(KEY(9))).toBe("nine's own words");
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(KEY(9));
  });

  // The first version of this test switched conversations and asserted the
  // composer was empty — and it passed with the `cancelled` guard deleted,
  // because conversation four had nothing stored, so the slow read resolved
  // to null and there was nothing to land late. It proved that null is not a
  // draft. §2, in a file written to be §13.
  //
  // The read has to be BOTH slow and non-empty for the race to exist at all.
  it("does not let a slow read land in the conversation the person moved to", async () => {
    let releaseFour: (value: string) => void = () => {};
    const four = new Promise<string>((resolve) => {
      releaseFour = resolve;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === KEY(4) ? four : Promise.resolve(null),
    );

    const { rerender, result } = renderHook(({ id }: { id: number }) => useDraft(id), {
      initialProps: { id: 4 },
    });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(4)));

    // Gone before four's storage answered.
    rerender({ id: 9 });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY(9)));

    await act(async () => {
      releaseFour("four's words, arriving too late");
      await four;
    });

    expect(result.current.draft).toBe("");
  });
});

describe("no conversation yet", () => {
  it("reads nothing and writes nothing", async () => {
    const { result } = renderHook(() => useDraft(null));

    act(() => result.current.setDraft("nowhere to put this"));

    await waitFor(() => expect(result.current.draft).toBe("nowhere to put this"));
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
